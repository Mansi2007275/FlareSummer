// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RiskOracleConsumer.sol";

/**
 * @title InsurancePool
 * @notice Buys cover against a specific FAssets agent, priced dynamically
 * from that agent's confidential-compute risk score. Pays out automatically
 * once a liquidation / de-peg event for the covered agent has been verified.
 *
 * Payout verification: in production, `reportVerifiedLiquidation` would be
 * called by a contract that has itself checked a Flare Data Connector (FDC)
 * attestation proof for the liquidation event on-chain — no human claims
 * process, no manual review. For this hackathon build, that role is held by
 * an authorized `claimsVerifier` address so the flow can be demoed against
 * `MockFAssetAgent` without a full FDC round trip.
 */
contract InsurancePool is Ownable, ReentrancyGuard {
    RiskOracleConsumer public riskOracle;

    /// @notice Address allowed to mark an agent's liquidation as verified (stand-in for FDC).
    address public claimsVerifier;

    /// @notice Base annualized premium rate, in basis points of cover amount (e.g. 300 = 3%/yr).
    uint256 public baseRateBP = 300;

    /// @notice How strongly the risk score (0-100) scales the base rate.
    /// Effective annual rate = baseRateBP * (100 + score * riskWeightBP / 100) / 100
    uint256 public riskWeightBP = 300; // score of 100 -> 4x base rate

    uint256 public minCoverWei = 0.01 ether;
    uint256 public maxCoverWei = 50 ether;
    uint256 public minDurationDays = 1;
    uint256 public maxDurationDays = 365;

    uint256 public nextCoverId;

    struct Cover {
        address holder;
        address agent;
        uint256 coverAmount;
        uint256 premiumPaid;
        uint256 startTime;
        uint256 expiry;
        bool active;
        bool claimed;
    }

    mapping(uint256 => Cover) public covers;
    mapping(address => bool) public agentLiquidationVerified;
    mapping(address => uint256[]) public coversByHolder;

    /// @notice Running total of cover amount currently underwritten, used as a solvency guard.
    uint256 public totalActiveExposure;

    event ClaimsVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event RiskOracleUpdated(address indexed previousOracle, address indexed newOracle);
    event PoolFunded(address indexed funder, uint256 amount);
    event CoverPurchased(
        uint256 indexed coverId,
        address indexed holder,
        address indexed agent,
        uint256 coverAmount,
        uint256 premiumPaid,
        uint256 expiry,
        uint8 riskScoreAtPurchase
    );
    event LiquidationVerified(address indexed agent, uint256 timestamp);
    event PayoutTriggered(uint256 indexed coverId, address indexed holder, uint256 amount);
    event CoverExpired(uint256 indexed coverId);

    error InvalidAmount();
    error InvalidDuration();
    error InsufficientPayment();
    error NotClaimsVerifier();
    error CoverNotActive();
    error CoverExpiredErr();
    error AgentNotVerifiedLiquidated();
    error AlreadyClaimed();
    error NotCoverHolder();
    error InsufficientPoolReserve();

    modifier onlyClaimsVerifier() {
        if (msg.sender != claimsVerifier) revert NotClaimsVerifier();
        _;
    }

    constructor(address _riskOracle, address _claimsVerifier) Ownable(msg.sender) {
        riskOracle = RiskOracleConsumer(_riskOracle);
        claimsVerifier = _claimsVerifier;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setClaimsVerifier(address _verifier) external onlyOwner {
        emit ClaimsVerifierUpdated(claimsVerifier, _verifier);
        claimsVerifier = _verifier;
    }

    function setRiskOracle(address _oracle) external onlyOwner {
        emit RiskOracleUpdated(address(riskOracle), _oracle);
        riskOracle = RiskOracleConsumer(_oracle);
    }

    function setPricingParams(uint256 _baseRateBP, uint256 _riskWeightBP) external onlyOwner {
        baseRateBP = _baseRateBP;
        riskWeightBP = _riskWeightBP;
    }

    function setCoverLimits(
        uint256 _minCoverWei,
        uint256 _maxCoverWei,
        uint256 _minDurationDays,
        uint256 _maxDurationDays
    ) external onlyOwner {
        minCoverWei = _minCoverWei;
        maxCoverWei = _maxCoverWei;
        minDurationDays = _minDurationDays;
        maxDurationDays = _maxDurationDays;
    }

    // ---------------------------------------------------------------------
    // Pool funding (LPs / treasury topping up claim-paying reserve)
    // ---------------------------------------------------------------------

    function fundPool() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    function poolReserve() public view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Reserve not already promised to an active cover — the true "free" solvency buffer.
    function freeReserve() public view returns (uint256) {
        uint256 balance = address(this).balance;
        if (totalActiveExposure >= balance) return 0;
        return balance - totalActiveExposure;
    }

    // ---------------------------------------------------------------------
    // Pricing
    // ---------------------------------------------------------------------

    /// @notice Quote the premium (in wei) for covering `agent` for `coverAmount` wei over `durationDays`.
    function calculatePremium(address agent, uint256 coverAmount, uint256 durationDays)
        public
        view
        returns (uint256 premium, uint8 riskScore)
    {
        riskScore = riskOracle.getRiskScore(agent);

        // effectiveRateBP = baseRateBP * (10000 + riskScore * riskWeightBP) / 10000
        uint256 effectiveRateBP = (baseRateBP * (10000 + uint256(riskScore) * riskWeightBP)) / 10000;

        // premium = coverAmount * effectiveRateBP/10000 * durationDays/365
        premium = (coverAmount * effectiveRateBP * durationDays) / (10000 * 365);
    }

    // ---------------------------------------------------------------------
    // Buying cover
    // ---------------------------------------------------------------------

    function buyCover(address agent, uint256 coverAmount, uint256 durationDays)
        external
        payable
        nonReentrant
        returns (uint256 coverId)
    {
        if (coverAmount < minCoverWei || coverAmount > maxCoverWei) revert InvalidAmount();
        if (durationDays < minDurationDays || durationDays > maxDurationDays) revert InvalidDuration();

        (uint256 premium, uint8 riskScore) = calculatePremium(agent, coverAmount, durationDays);
        if (msg.value < premium) revert InsufficientPayment();

        // The pool must be able to cover this policy on top of everything already promised.
        if (freeReserve() + premium < coverAmount) revert InsufficientPoolReserve();

        coverId = nextCoverId++;
        uint256 expiry = block.timestamp + (durationDays * 1 days);

        covers[coverId] = Cover({
            holder: msg.sender,
            agent: agent,
            coverAmount: coverAmount,
            premiumPaid: premium,
            startTime: block.timestamp,
            expiry: expiry,
            active: true,
            claimed: false
        });
        coversByHolder[msg.sender].push(coverId);
        totalActiveExposure += coverAmount;

        emit CoverPurchased(coverId, msg.sender, agent, coverAmount, premium, expiry, riskScore);

        // Refund any overpayment.
        uint256 refund = msg.value - premium;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            require(ok, "refund failed");
        }
    }

    // ---------------------------------------------------------------------
    // Claims verification (FDC stand-in) + payout
    // ---------------------------------------------------------------------

    /// @notice Marks an agent as having a Flare-Data-Connector-verified liquidation / de-peg event.
    function reportVerifiedLiquidation(address agent) external onlyClaimsVerifier {
        agentLiquidationVerified[agent] = true;
        emit LiquidationVerified(agent, block.timestamp);
    }

    /// @notice Anyone can trigger payout on a cover once its agent's liquidation is verified —
    /// there is no discretionary claims review, the check is purely on-chain state.
    function triggerPayout(uint256 coverId) external nonReentrant {
        Cover storage cover = covers[coverId];
        if (!cover.active) revert CoverNotActive();
        if (cover.claimed) revert AlreadyClaimed();
        if (block.timestamp > cover.expiry) revert CoverExpiredErr();
        if (!agentLiquidationVerified[cover.agent]) revert AgentNotVerifiedLiquidated();

        cover.claimed = true;
        cover.active = false;
        totalActiveExposure -= cover.coverAmount;

        emit PayoutTriggered(coverId, cover.holder, cover.coverAmount);

        (bool ok, ) = cover.holder.call{value: cover.coverAmount}("");
        require(ok, "payout transfer failed");
    }

    /// @notice Lets a holder (or anyone, it's a pure bookkeeping op) close out an expired,
    /// never-claimed cover so its exposure stops counting against solvency.
    function expireCover(uint256 coverId) external {
        Cover storage cover = covers[coverId];
        if (!cover.active) revert CoverNotActive();
        if (block.timestamp <= cover.expiry) revert InvalidDuration();

        cover.active = false;
        totalActiveExposure -= cover.coverAmount;
        emit CoverExpired(coverId);
    }

    function getCoversByHolder(address holder) external view returns (uint256[] memory) {
        return coversByHolder[holder];
    }

    // ---------------------------------------------------------------------
    // Treasury
    // ---------------------------------------------------------------------

    /// @notice Owner can withdraw only the portion of the reserve not backing active covers.
    function withdrawSurplus(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > freeReserve()) revert InsufficientPoolReserve();
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
