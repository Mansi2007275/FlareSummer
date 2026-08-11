// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RiskOracleConsumer
 * @notice On-chain landing pad for risk scores computed off-chain inside a
 * confidential compute environment (Flare FCC / TEE).
 *
 * The scoring model itself (collateral-ratio proximity, FTSO volatility,
 * historical liquidation count, weighting) never touches this contract or
 * the frontend — only the resulting `score` (0-100) and an `attestationHash`
 * are ever written on-chain. That hash is a commitment to
 * (inputData, modelVersion, score) produced inside the TEE, so anyone can
 * verify a score was not hand-picked after the fact without ever learning
 * the model's internal thresholds.
 *
 * `reporter` is the TEE agent's wallet in this hackathon build. In
 * production this would instead be gated behind Flare's FCC attestation
 * verifier so the contract checks a real remote-attestation quote before
 * accepting a submission.
 */
contract RiskOracleConsumer is Ownable {
    struct RiskData {
        uint8 score; // 0 (safe) - 100 (critical)
        bytes32 attestationHash; // commitment produced inside the TEE
        uint256 updatedAt;
        uint256 modelVersion;
    }

    /// @notice Score is considered stale after this many seconds and falls back to a
    /// conservative maximum-risk value so an outdated report can never under-price risk.
    uint256 public constant STALE_AFTER = 1 hours;

    /// @notice Wallet authorized to submit scores (the off-chain TEE risk agent).
    address public reporter;

    mapping(address => RiskData) private _riskData;

    event ReporterUpdated(address indexed previousReporter, address indexed newReporter);
    event RiskScoreSubmitted(
        address indexed agent,
        uint8 score,
        bytes32 attestationHash,
        uint256 modelVersion,
        uint256 timestamp
    );

    error NotReporter();
    error ScoreOutOfRange();

    modifier onlyReporter() {
        if (msg.sender != reporter) revert NotReporter();
        _;
    }

    constructor(address _reporter) Ownable(msg.sender) {
        reporter = _reporter;
        emit ReporterUpdated(address(0), _reporter);
    }

    function setReporter(address _reporter) external onlyOwner {
        emit ReporterUpdated(reporter, _reporter);
        reporter = _reporter;
    }

    /// @notice Called by the TEE agent after each scoring run.
    function submitRiskScore(
        address agent,
        uint8 score,
        bytes32 attestationHash,
        uint256 modelVersion
    ) external onlyReporter {
        if (score > 100) revert ScoreOutOfRange();
        _riskData[agent] = RiskData({
            score: score,
            attestationHash: attestationHash,
            updatedAt: block.timestamp,
            modelVersion: modelVersion
        });
        emit RiskScoreSubmitted(agent, score, attestationHash, modelVersion, block.timestamp);
    }

    /// @notice Returns the score to use for pricing, applying the staleness fallback.
    function getRiskScore(address agent) public view returns (uint8) {
        RiskData memory data = _riskData[agent];
        if (data.updatedAt == 0) return 100; // never scored -> treat as max risk
        if (block.timestamp - data.updatedAt > STALE_AFTER) return 100; // stale -> max risk
        return data.score;
    }

    /// @notice Returns the full record, including whether it is currently considered fresh.
    function getRiskData(address agent)
        external
        view
        returns (uint8 score, bytes32 attestationHash, uint256 updatedAt, uint256 modelVersion, bool isFresh)
    {
        RiskData memory data = _riskData[agent];
        isFresh = data.updatedAt != 0 && (block.timestamp - data.updatedAt <= STALE_AFTER);
        return (data.score, data.attestationHash, data.updatedAt, data.modelVersion, isFresh);
    }
}
