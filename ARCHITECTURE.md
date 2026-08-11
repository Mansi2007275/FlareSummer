# Architecture — FXRP Sentinel

## 1. High-level flow

```
 [FTSO Price Feed] ──┐
                      ├──> [Risk Agent (TEE-style, backend/)] ──score + attestation──> [RiskOracleConsumer.sol]
 [MockFAssetAgent] ───┘         reads collateral ratio + price volatility                          │
                                                                                                      ▼
 [User Wallet] ──buyCover(), pays premium──> [InsurancePool.sol] <── reads risk score via oracle ────┘
        │                                          │
        │                                          ├── stores Cover{ holder, agent, amount, expiry }
        │                                          └── premium adds to pool reserve
        │
        ▼
 [claimsVerifier] ──reportVerifiedLiquidation(agent)──> [InsurancePool.sol]
                                                                │
                                                                ▼
                                          [anyone] ──triggerPayout(coverId)──> user receives coverAmount
```

## 2. Contracts (`contracts/contracts/`)

### `interfaces/IFtsoV2Interface.sol`, `interfaces/IFlareContractRegistry.sol`
Minimal, ABI-compatible mirrors of Flare's real on-chain interfaces. We vendor these
instead of depending on the exact subpath layout of the `@flarenetwork/flare-periphery-contracts`
npm package, so the project compiles deterministically against any Flare network without
being tied to that package's internal structure. They're safe to call against the real
deployed contracts because the function selectors match exactly.

### `FtsoV2Consumer.sol`
Looks up the live `FtsoV2` contract through `FlareContractRegistry`
(`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` — identical on every Flare network) rather
than hardcoding an address that could change between Flare upgrades. Exposes
`getPrice(feedId)` plus convenience wrappers for FLR/USD and XRP/USD.

### `RiskOracleConsumer.sol`
The landing pad for scores computed off-chain inside a confidential-compute-style
environment. Stores `{ score (0-100), attestationHash, updatedAt, modelVersion }` per
agent. Two things make this more than a bare key-value store:

- **Reporter gating.** Only one address (`reporter`, the TEE agent's wallet in this build)
  can write. In production this would instead be gated behind an FCC attestation-verifying
  contract that checks a real remote-attestation quote before accepting a submission.
- **Staleness fallback.** `getRiskScore()` returns `100` (max risk) if a score has never
  been submitted, or if the last submission is older than `STALE_AFTER` (1 hour). This means
  a dead or delayed risk agent can never *silently* under-price risk — the pool always fails
  safe toward "charge more."

### `InsurancePool.sol`
The product. Key design choices:

- **Pricing** (`calculatePremium`) scales an annualized base rate by the agent's live risk
  score: `effectiveRate = baseRate * (1 + score * riskWeight)`, then pro-rates by cover
  amount and duration. A score of 100 charges up to 4x the base rate by default.
- **Solvency guard.** `buyCover` checks `freeReserve() + premium >= coverAmount` before
  accepting a policy, so the pool can never sell more cover than it could plausibly pay out.
  `freeReserve()` subtracts `totalActiveExposure` (sum of all active covers) from the
  contract's balance.
- **Claims are a state check, not a process.** `reportVerifiedLiquidation(agent)` — callable
  only by `claimsVerifier` — flips a boolean once a liquidation has been verified. From then
  on, `triggerPayout(coverId)` is callable by *anyone* (not just the policyholder) and simply
  transfers `coverAmount` to the holder. There's no discretionary review step to dispute.
- **Native-token accounting.** Premiums and payouts use the chain's native token (C2FLR /
  FLR) via `msg.value` rather than a custom ERC-20, which keeps the demo's trust surface
  smaller — no separate token approval flow to explain to judges.

### `mocks/MockFAssetAgent.sol`
Stands in for a real FAssets `AssetManager` agent vault so the full "risk rises → premium
rises → agent liquidated → cover pays out" flow can be demoed on Coston2 without waiting on,
or risking money against, a real agent actually approaching liquidation during judging.
`setCollateralRatio()` auto-liquidates once the ratio drops below the threshold;
`simulateLiquidation()` force-triggers it for a clean demo.

## 3. TEE risk agent (`backend/`)

`risk_agent.py` runs a loop (default: every 60s) that, per monitored agent:

1. Reads `collateralRatioBP`, `liquidationThresholdBP`, and `liquidationCount` from the
   agent contract.
2. Reads XRP/USD from `FtsoV2Consumer` and keeps a rolling local window
   (`.price_history.json`) to compute trailing volatility.
3. Runs `compute_risk_score()` — a weighted heuristic (60% collateral-buffer proximity to
   the liquidation threshold, 30% price volatility, 10% historical liquidation count — see
   the function's docstring for the exact reasoning behind those weights).
4. Builds an attestation via `attestation.py`: hashes `(inputs, model_version, score)` with
   keccak256 and signs that hash with the agent's key.
5. Submits `(agent, score, attestationHash, modelVersion)` to
   `RiskOracleConsumer.submitRiskScore()`.

**What's real here vs. what's a stand-in for FCC:** the scoring math, the FTSO reads, the
attestation hash/signature construction, and the on-chain submission are all real, working
code (verified independently — see README "Status"). What's stubbed is the actual TEE
*hardware* attestation quote — Flare's FCC product is still listed as "in development" in
their docs, so `attestation.py` produces the same *shape* of output (a verifiable commitment
to specific inputs and a specific model version) without a real enclave underneath it. This
is a drop-in-replaceable boundary: swap `build_attestation()` for a real FCC client call and
nothing else in the pipeline changes.

## 4. Frontend (`frontend/`)

Next.js 14 (App Router) + Tailwind, built and verified with `next build` (zero errors).

- `lib/config.js` / `lib/contracts.js` — all addresses and ABIs come from env vars and the
  compiled artifact ABIs (checked into `lib/abi/`), nothing hardcoded.
- `lib/hooks/useWallet.js` — connects an injected wallet (MetaMask etc.), and prompts a
  network switch/add to Coston2 if the wallet is on the wrong chain.
- `lib/hooks/usePoolData.js` — polls pool reserve, active exposure, per-agent risk data, and
  the live FTSO XRP/USD price every 15s.
- `components/AttestationStamp.jsx` — the UI's signature element: a rotated, jagged-edged
  "stamp" badge (CSS `clip-path`) that reads as a physical ink stamp on an insurance
  document, except what it's certifying is a confidential-compute attestation hash rather
  than a human signature. Present on every agent card and in the purchase-confirmation state.
- `components/BuyCoverModal.jsx` — live premium requoting as the user adjusts amount/duration
  (debounced on-chain `calculatePremium` calls), then submits `buyCover()` with a small
  buffer over the quote to absorb price movement between quote and mined block; the contract
  refunds the difference automatically.

Design language: Neubrutalism — 3px warm-black borders, hard offset shadows (no blur, no
gradients pretending to be shadows), a hazard-yellow canvas background tying into the
"sentinel on watch" concept, and a Space Grotesk/Inter/IBM Plex Mono type system (bold
geometric display face, plain body face, monospace for anything that's actually on-chain
data — addresses, hashes, scores, balances).

## 5. Mapping to judging criteria

| Criterion | How this build addresses it |
|---|---|
| Product usefulness | Solves a documented, audit-acknowledged risk (agent collateral failure + oracle manipulation), not a generic feature |
| Flare integration quality | FTSOv2 (live pricing), a stand-in for FCC (confidential risk scoring), and an FDC-style verified-event gate for payouts — not superficial name-drops |
| Technical execution | Contracts compiled + 9/9 tests passing; deploy script runs end-to-end; frontend builds clean; Python agent's crypto logic independently verified |
| Evidence of new work | Every contract, the agent, and the UI were built for this project — only the general TEE-attestation *pattern* draws on prior public art (Flare's own `flare-ai-skills` examples) |
| Clarity & future potential | Clear, incremental roadmap to real FCC/FDC, multi-asset support, and governance |
