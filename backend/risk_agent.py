"""
risk_agent.py — FXRP Sentinel confidential-compute risk scoring agent.

Run this INSIDE a TEE / Flare Confidential Compute enclave in production.
Locally it behaves identically minus the actual hardware attestation quote
(see attestation.py for exactly what's stubbed and why).

What it does, every cycle:
  1. Reads each monitored FAsset agent's collateral ratio (from the FAssets
     AssetManager in production; from MockFAssetAgent here).
  2. Reads the live underlying-asset price from FTSOv2 and keeps a rolling
     local window to estimate short-term volatility.
  3. Combines these with the agent's historical liquidation count into a
     single 0-100 risk score using `compute_risk_score()`.
  4. Builds a cryptographic attestation binding (inputs, model version,
     score) — see attestation.py.
  5. Submits (agent, score, attestationHash, modelVersion) to
     RiskOracleConsumer.submitRiskScore() on-chain.

The scoring weights below are intentionally never exposed anywhere except
this file — that's the entire point of routing risk assessment through a
confidential-compute style agent instead of a public formula in the
frontend or a public contract.
"""

import json
import os
import time
import logging
from pathlib import Path
from dataclasses import asdict

import schedule
from dotenv import load_dotenv
from web3 import Web3

from attestation import ScoringInputs, build_attestation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [risk-agent] %(levelname)s %(message)s",
)
log = logging.getLogger("risk-agent")

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

RPC_URL = os.environ["RPC_URL"]
CHAIN_ID = int(os.environ.get("CHAIN_ID", "114"))
AGENT_PRIVATE_KEY = os.environ["AGENT_PRIVATE_KEY"]
RISK_ORACLE_ADDRESS = Web3.to_checksum_address(os.environ["RISK_ORACLE_ADDRESS"])
FTSO_CONSUMER_ADDRESS = Web3.to_checksum_address(os.environ["FTSO_CONSUMER_ADDRESS"])
MONITORED_AGENTS = [
    Web3.to_checksum_address(a.strip())
    for a in os.environ.get("MONITORED_AGENTS", "").split(",")
    if a.strip()
]
SCORING_INTERVAL_SECONDS = int(os.environ.get("SCORING_INTERVAL_SECONDS", "60"))
MODEL_VERSION = int(os.environ.get("MODEL_VERSION", "1"))

PRICE_HISTORY_FILE = HERE / ".price_history.json"
PRICE_HISTORY_WINDOW = 30  # keep the last 30 readings per feed for volatility

w3 = Web3(Web3.HTTPProvider(RPC_URL))
agent_account = w3.eth.account.from_key(AGENT_PRIVATE_KEY)


def _load_abi(name: str):
    with open(HERE / "abi" / name) as f:
        return json.load(f)


risk_oracle = w3.eth.contract(address=RISK_ORACLE_ADDRESS, abi=_load_abi("RiskOracleConsumer.json"))
ftso_consumer = w3.eth.contract(address=FTSO_CONSUMER_ADDRESS, abi=_load_abi("FtsoV2Consumer.json"))
mock_agent_abi = _load_abi("MockFAssetAgent.json")


# ---------------------------------------------------------------------------
# Price history / volatility helpers
# ---------------------------------------------------------------------------

def _load_price_history() -> dict:
    if PRICE_HISTORY_FILE.exists():
        return json.loads(PRICE_HISTORY_FILE.read_text())
    return {}


def _save_price_history(history: dict) -> None:
    PRICE_HISTORY_FILE.write_text(json.dumps(history))


def get_xrp_price_usd_and_volatility() -> tuple[float, float]:
    """Reads live XRP/USD from FTSOv2 and returns (price, trailing pct volatility)."""
    try:
        value, decimals, _timestamp = ftso_consumer.functions.getXrpUsdPrice().call(
            {"from": agent_account.address}
        )
        price = value / (10 ** decimals)
    except Exception as exc:  # RPC hiccup / feed not live on this network yet
        log.warning("FTSO read failed (%s); falling back to last known price", exc)
        history = _load_price_history()
        series = history.get("XRP/USD", [])
        price = series[-1] if series else 0.52  # sane fallback so the demo never hard-fails

    history = _load_price_history()
    series = history.get("XRP/USD", [])
    series.append(price)
    series = series[-PRICE_HISTORY_WINDOW:]
    history["XRP/USD"] = series
    _save_price_history(history)

    if len(series) < 2:
        return price, 0.0

    high, low = max(series), min(series)
    volatility_pct = ((high - low) / low) * 100 if low > 0 else 0.0
    return price, volatility_pct


# ---------------------------------------------------------------------------
# Scoring model — the part that stays private
# ---------------------------------------------------------------------------

def compute_risk_score(
    collateral_ratio_bp: int,
    liquidation_threshold_bp: int,
    price_volatility_pct: float,
    historical_liquidation_count: int,
) -> int:
    """
    Weighted heuristic, 0 (safest) - 100 (critical).

    Component weights (sum to 100):
      - 60: collateral buffer proximity to the liquidation threshold.
            The closer the ratio sits to the threshold, the higher this
            component — this is the single strongest predictor of near-term
            liquidation risk.
      - 30: recent underlying-asset price volatility. Flare's own FAssets
            audit flags oracle/price-channel issues as a systemic risk
            multiplier on top of an agent's own collateral management, so
            volatility is weighted heavily but below the direct buffer signal.
      - 10: historical liquidation count for this agent, as a track-record
            adjustment (an agent that has been liquidated before is treated
            as structurally riskier even if its buffer looks fine today).
    """
    # --- Component 1: collateral buffer (0-60) ---
    if liquidation_threshold_bp <= 0:
        buffer_component = 60
    else:
        buffer_pct = (collateral_ratio_bp - liquidation_threshold_bp) / liquidation_threshold_bp
        # buffer_pct of 0 (right at threshold) -> max component; >=50% buffer -> ~0
        buffer_component = max(0.0, 60 * (1 - min(buffer_pct / 0.5, 1.0)))

    # --- Component 2: price volatility (0-30) ---
    # >=15% trailing volatility is treated as maximally risky for this component.
    volatility_component = min(price_volatility_pct / 15.0, 1.0) * 30

    # --- Component 3: historical liquidations (0-10) ---
    history_component = min(historical_liquidation_count, 5) * 2  # caps at 10

    score = buffer_component + volatility_component + history_component
    return max(0, min(100, round(score)))


# ---------------------------------------------------------------------------
# Per-agent scoring + on-chain submission
# ---------------------------------------------------------------------------

_nonce_cache = {"value": None}


def _next_nonce() -> int:
    if _nonce_cache["value"] is None:
        _nonce_cache["value"] = w3.eth.get_transaction_count(agent_account.address)
    nonce = _nonce_cache["value"]
    _nonce_cache["value"] += 1
    return nonce


def score_and_submit(agent_address: str, price_usd: float, volatility_pct: float) -> None:
    agent_contract = w3.eth.contract(address=agent_address, abi=mock_agent_abi)

    collateral_ratio_bp = agent_contract.functions.collateralRatioBP().call()
    liquidation_threshold_bp = agent_contract.functions.liquidationThresholdBP().call()
    historical_liquidation_count = agent_contract.functions.liquidationCount().call()

    score = compute_risk_score(
        collateral_ratio_bp, liquidation_threshold_bp, volatility_pct, historical_liquidation_count
    )

    inputs = ScoringInputs(
        agent_address=agent_address,
        collateral_ratio_bp=collateral_ratio_bp,
        liquidation_threshold_bp=liquidation_threshold_bp,
        underlying_price_usd=price_usd,
        price_volatility_24h_pct=round(volatility_pct, 4),
        historical_liquidation_count=historical_liquidation_count,
        timestamp=int(time.time()),
    )

    attestation = build_attestation(inputs, MODEL_VERSION, score, AGENT_PRIVATE_KEY)

    log.info(
        "agent=%s ratio=%.2f%% threshold=%.2f%% vol=%.2f%% liqs=%d -> score=%d",
        agent_address,
        collateral_ratio_bp / 100,
        liquidation_threshold_bp / 100,
        volatility_pct,
        historical_liquidation_count,
        score,
    )

    gas_price = w3.eth.gas_price
    target_gas = max(int(gas_price * 1.5), w3.to_wei("700", "gwei"))

    tx = risk_oracle.functions.submitRiskScore(
        agent_address,
        score,
        bytes.fromhex(attestation.attestation_hash[2:]),
        MODEL_VERSION,
    ).build_transaction(
        {
            "from": agent_account.address,
            "nonce": _next_nonce(),
            "chainId": CHAIN_ID,
            "gas": 200_000,
            "maxFeePerGas": target_gas,
            "maxPriorityFeePerGas": target_gas,
        }
    )
    signed = w3.eth.account.sign_transaction(tx, private_key=AGENT_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    log.info("submitted risk score, tx=%s", tx_hash.hex())


def run_scoring_cycle() -> None:
    if not MONITORED_AGENTS:
        log.warning("MONITORED_AGENTS is empty — nothing to score. Check .env")
        return

    price_usd, volatility_pct = get_xrp_price_usd_and_volatility()
    log.info("XRP/USD=%.4f  trailing volatility=%.2f%%", price_usd, volatility_pct)

    for agent_address in MONITORED_AGENTS:
        try:
            score_and_submit(agent_address, price_usd, volatility_pct)
        except Exception as exc:
            log.exception("failed to score/submit for %s: %s", agent_address, exc)


def main() -> None:
    log.info("FXRP Sentinel risk agent starting")
    log.info("reporter wallet: %s", agent_account.address)
    log.info("monitoring %d agent(s): %s", len(MONITORED_AGENTS), MONITORED_AGENTS)

    run_scoring_cycle()  # run once immediately on startup
    schedule.every(SCORING_INTERVAL_SECONDS).seconds.do(run_scoring_cycle)

    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == "__main__":
    main()
