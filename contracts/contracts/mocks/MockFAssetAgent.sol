// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockFAssetAgent
 * @notice Stand-in for a real FAssets collateral agent so the full
 * "risk rises -> premium rises -> agent liquidated -> cover pays out" flow
 * can be demoed end-to-end on Coston2 without waiting on (or risking money
 * against) a real agent actually approaching liquidation during judging.
 *
 * A production integration would read the real agent registry from the
 * FAssets AssetManager contract instead of this mock.
 */
contract MockFAssetAgent is Ownable {
    string public label;
    uint256 public collateralRatioBP; // basis points, e.g. 15000 = 150.00%
    uint256 public liquidationThresholdBP; // e.g. 12000 = 120.00%
    bool public liquidated;
    uint256 public liquidationCount;

    event CollateralRatioUpdated(uint256 newRatioBP);
    event AgentLiquidated(uint256 collateralRatioBP, uint256 timestamp);
    event AgentRestored();

    constructor(string memory _label, uint256 _initialRatioBP, uint256 _liquidationThresholdBP)
        Ownable(msg.sender)
    {
        label = _label;
        collateralRatioBP = _initialRatioBP;
        liquidationThresholdBP = _liquidationThresholdBP;
    }

    /// @notice Simulates the agent's collateral ratio drifting with the market.
    function setCollateralRatio(uint256 newRatioBP) external onlyOwner {
        collateralRatioBP = newRatioBP;
        emit CollateralRatioUpdated(newRatioBP);
        if (newRatioBP < liquidationThresholdBP && !liquidated) {
            _liquidate();
        }
    }

    /// @notice Force-trigger a liquidation for demo purposes regardless of current ratio.
    function simulateLiquidation() external onlyOwner {
        _liquidate();
    }

    function _liquidate() internal {
        liquidated = true;
        liquidationCount += 1;
        emit AgentLiquidated(collateralRatioBP, block.timestamp);
    }

    /// @notice Reset after a demo run so the same agent can be reused.
    function restore(uint256 newRatioBP) external onlyOwner {
        liquidated = false;
        collateralRatioBP = newRatioBP;
        emit AgentRestored();
    }

    function isHealthy() external view returns (bool) {
        return !liquidated && collateralRatioBP >= liquidationThresholdBP;
    }
}
