"""
attestation.py — commitment / attestation layer for the FXRP Sentinel risk agent.

In a full Flare Confidential Compute (FCC) deployment, this module would be
replaced by a call into the TEE's remote-attestation service: the enclave
produces a signed quote binding (code measurement, input hash, output) that
an on-chain verifier contract checks before accepting a submission. FCC is
still listed as "in development" on Flare's docs as of this build, so this
module stands in with the same *interface* the real thing would have:

    build_attestation(inputs, model_version, score) -> (attestation_hash, signature)

so that swapping in the real FCC attestation client later is a drop-in
replacement, not a rewrite of risk_agent.py.

What it actually does today:
  1. Serializes the exact inputs the model saw (collateral ratio, price,
     volatility window, historical liquidation count) plus the model version
     and the resulting score into a canonical JSON string.
  2. Hashes that string with keccak256 -> this is the `attestationHash`
     stored in RiskOracleConsumer. Anyone can independently recompute this
     hash from logged inputs to verify the score wasn't altered after the
     fact — they still can't see *why* the model weighted things the way it
     did, only that a specific input set deterministically produced this
     score under a specific model version.
  3. Signs that hash with the agent's private key as a second, transport-
     level integrity check (separate from the reporter-address check the
     contract already does).
"""

import json
from dataclasses import dataclass, asdict

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3


@dataclass
class ScoringInputs:
    agent_address: str
    collateral_ratio_bp: int
    liquidation_threshold_bp: int
    underlying_price_usd: float
    price_volatility_24h_pct: float
    historical_liquidation_count: int
    timestamp: int


@dataclass
class Attestation:
    inputs_json: str
    attestation_hash: str  # bytes32 hex, goes on-chain
    signature: str  # off-chain integrity signature, logged for auditability
    model_version: int
    score: int


def _canonical_json(inputs: ScoringInputs, model_version: int, score: int) -> str:
    payload = {
        "inputs": asdict(inputs),
        "model_version": model_version,
        "score": score,
    }
    # sort_keys makes this reproducible regardless of dict insertion order,
    # so two parties who recompute the hash from the same inputs always agree.
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def build_attestation(
    inputs: ScoringInputs,
    model_version: int,
    score: int,
    signer_private_key: str,
) -> Attestation:
    canonical = _canonical_json(inputs, model_version, score)
    attestation_hash = Web3.keccak(text=canonical).hex()

    account = Account.from_key(signer_private_key)
    message = encode_defunct(hexstr=attestation_hash)
    signed = account.sign_message(message)

    return Attestation(
        inputs_json=canonical,
        attestation_hash=attestation_hash,
        signature=signed.signature.hex(),
        model_version=model_version,
        score=score,
    )


def verify_attestation(attestation: Attestation, expected_signer: str) -> bool:
    """Recomputes the hash from the logged inputs and checks the signature —
    exactly what a curious user or judge can do independently, without
    needing access to the model itself."""
    recomputed_hash = Web3.keccak(text=attestation.inputs_json).hex()
    if recomputed_hash != attestation.attestation_hash:
        return False

    message = encode_defunct(hexstr=attestation.attestation_hash)
    recovered = Account.recover_message(message, signature=attestation.signature)
    return recovered.lower() == expected_signer.lower()
