# FXRP Sentinel

AI-agent underwritten, confidentially-priced insurance layer for FAssets on Flare.

Built for: Flare hackathon — Bounty 1 (Interoperable Asset Products) + Bounty 2 (Confidential Compute Apps)

## Status

Everything in `contracts/` has been compiled and tested for real:

```
9 passing (1s)
  RiskOracleConsumer
    ✔ only allows the designated reporter to submit scores
    ✔ returns max risk (100) for an agent that has never been scored
    ✔ stores and returns a fresh score from the reporter
    ✔ falls back to max risk once a score goes stale
  Premium pricing
    ✔ charges a strictly higher premium for a riskier agent, same amount and duration
  Buying cover and claiming payout
    ✔ lets a user buy cover, then pays out automatically once liquidation is verified
    ✔ reverts a payout attempt if liquidation was never verified
    ✔ rejects cover requests that would exceed the pool's free reserve
    ✔ refunds any overpayment above the quoted premium
```

`scripts/deploy.js` has been run end-to-end on a local chain and prints every address the
other two components need. `frontend/` has been installed and run through `next build`
with zero errors. `backend/attestation.py` has been exercised standalone (hash + sign +
verify round trip). Wire them together with real addresses and you have a working demo.

## The problem

FAssets (like FXRP) let non-smart-contract assets — XRP, BTC, DOGE — become usable in
Flare DeFi. Each FAsset is backed by an agent who locks collateral. Three things follow
from that:

1. **Collateral can quietly degrade.** A holder has no visibility into whether the agent
   backing their FXRP is drifting toward liquidation until it's too late.
2. **Price-feed risk compounds it.** Flare's own FAssets security documentation names
   oracle/price-channel manipulation or staleness as a direct threat to collateral-ratio
   accuracy and liquidation fairness — this isn't hypothetical, it's an acknowledged
   systemic risk across the whole FAssets ecosystem.
3. **There's no protection layer.** If an agent is liquidated or the peg breaks, there is
   nothing between the holder and the loss.

A fourth problem shapes the design: any *public* risk-scoring system can be reverse
engineered by the agents it's scoring, who then game the exact thresholds that trigger a
worse price or a liquidation call.

## The solution

FXRP Sentinel is an insurance pool with three moving parts:

- **A confidential risk model** (`backend/`) reads FTSO prices and each agent's
  collateral ratio, scores the agent 0–100, and publishes only the score plus a
  cryptographic attestation hash — never the model itself.
- **A pricing pool** (`contracts/InsurancePool.sol`) charges a premium that scales with
  that live risk score. Riskier agent, higher rate — actuarially sound, not flat-rate.
- **Automatic payout.** Once a covered agent's liquidation is verified on-chain, any
  wallet can trigger the payout — there's no discretionary claims review to argue with.

## Repo structure

```
fxrp-sentinel/
├── contracts/                          Hardhat project (Solidity ^0.8.24)
│   ├── contracts/
│   │   ├── InsurancePool.sol           Core pool: pricing, buy cover, verified payout
│   │   ├── RiskOracleConsumer.sol      Stores TEE-attested risk scores, stale-fallback
│   │   ├── FtsoV2Consumer.sol          Live FTSOv2 price reads via FlareContractRegistry
│   │   ├── interfaces/
│   │   │   ├── IFlareContractRegistry.sol
│   │   │   └── IFtsoV2Interface.sol    Vendored, ABI-matched — no fragile package pin
│   │   └── mocks/
│   │       └── MockFAssetAgent.sol     Simulated agent for demo-safe liquidation testing
│   ├── scripts/deploy.js               Deploys everything + seeds pool + 2 mock agents
│   ├── test/InsurancePool.test.js      9 tests, see Status above
│   ├── hardhat.config.js               Coston2 (114) + Flare mainnet (14) networks
│   ├── package.json / package-lock.json
│   └── .env.example
├── backend/                           Off-chain confidential-compute-style risk agent
│   ├── risk_agent.py                   Scoring loop + on-chain submission (web3.py)
│   ├── attestation.py                  Commitment hash + signature (see docstring)
│   ├── abi/*.json                      Extracted from compiled contracts
│   ├── requirements.txt
│   └── .env.example
├── frontend/                             Next.js 14 + Tailwind, Neubrutalism dashboard
│   ├── app/page.jsx, layout.jsx, globals.css
│   ├── components/                     Navbar, StatusStrip, AgentRiskCard,
│   │                                    BuyCoverModal, AttestationStamp, Footer
│   ├── lib/                            config.js, contracts.js, riskTier.js,
│   │   └── hooks/                      hooks/useWallet.js, hooks/usePoolData.js
│   ├── lib/abi/*.json
│   ├── package.json / package-lock.json, tailwind.config.js, next.config.js
│   └── .env.example
├── ARCHITECTURE.md
├── .gitignore
└── README.md   (this file)
```

## Quick start

### 1. Contracts

```bash
cd contracts
npm install
cp .env.example .env      # fill in PRIVATE_KEY with a FRESH test wallet's key
npx hardhat compile
npx hardhat test           # should print "9 passing"
npx hardhat run scripts/deploy.js --network coston2
```

Copy the five addresses the deploy script prints into `backend/.env` and `frontend/.env`
(there are matching placeholders in both `.env.example` files).

You'll need test C2FLR in your deploy wallet first — get it from the Coston2 faucet:
https://faucet.flare.network/coston2

### 2. TEE risk agent

```bash
cd backend
pip install -r requirements.txt --break-system-packages
cp .env.example .env       # fill in RPC/addresses from step 1, and a SEPARATE agent wallet key
python risk_agent.py
```

The agent wallet's address must match `reporter` on `RiskOracleConsumer` — either set
`TEE_AGENT_ADDRESS` before deploying, or call `riskOracle.setReporter(agentAddress)` after.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # fill in the same addresses, prefixed NEXT_PUBLIC_
npm run dev                # http://localhost:3000
```

## Demo script (for judges)

1. Dashboard loads two mock agents with live FTSO-backed risk scores and a TEE-attestation
   stamp on each card.
2. Open "Buy cover" on the riskier agent — watch the quoted premium update live as you
   change cover amount / duration, and note it's meaningfully higher than the safer agent's
   quote for the same terms.
3. In a second terminal, call `MockFAssetAgent.simulateLiquidation()` (Hardhat console or a
   small script) to trigger a liquidation, then call `InsurancePool.reportVerifiedLiquidation()`
   from the claims-verifier wallet.
4. Trigger payout from the dashboard (or `pool.triggerPayout(coverId)` directly) — funds land
   back in the buyer's wallet with no claim form.
5. Point at `npx hardhat test` output as independent proof the pricing and payout logic behave
   as claimed, not just as demoed.

## Roadmap (post-hackathon)

- Swap the `reporter`/`claimsVerifier` role checks for real Flare Confidential Compute (FCC)
  attestation verification and real FDC proof verification, once FCC is out of "in development".
- Support FBTC, FDOGE, and real FAssets AssetManager agent addresses instead of the mock.
- Governance-adjustable premium base rate via FLR-holder vote.
- Streaming (x402-style) micro-premiums instead of lump-sum, paid per block/hour of cover.
