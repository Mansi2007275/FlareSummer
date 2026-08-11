// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IFlareContractRegistry.sol";
import "./interfaces/IFtsoV2Interface.sol";

/**
 * @title FtsoV2Consumer
 * @notice Thin, reusable wrapper around Flare's FTSOv2 price feeds.
 *
 * Every other contract in this project (InsurancePool, and indirectly the
 * off-chain TEE risk agent) reads prices through this contract instead of
 * hardcoding an FTSO address, so the whole stack keeps working if Flare
 * upgrades the underlying FTSO implementation — the registry lookup is
 * always dynamic.
 */
contract FtsoV2Consumer {
    /// @dev Canonical FlareContractRegistry address — identical on every Flare network.
    address public constant REGISTRY = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;

    /// @notice Common feed ids used across this project (bytes21, category 01 = crypto).
    bytes21 public constant FEED_FLR_USD = 0x01464c522f55534400000000000000000000000000;
    bytes21 public constant FEED_XRP_USD = 0x015852502f55534400000000000000000000000000;
    bytes21 public constant FEED_BTC_USD = 0x014254432f55534400000000000000000000000000;

    event PriceRead(bytes21 indexed feedId, uint256 value, int8 decimals, uint64 timestamp);

    function _ftsoV2() internal view returns (IFtsoV2Interface) {
        return IFlareContractRegistry(REGISTRY).getFtsoV2();
    }

    /// @notice Get the live price for an arbitrary feed id.
    function getPrice(bytes21 _feedId) public returns (uint256 value, int8 decimals, uint64 timestamp) {
        (value, decimals, timestamp) = _ftsoV2().getFeedById(_feedId);
        emit PriceRead(_feedId, value, decimals, timestamp);
    }

    /// @notice Convenience getter for the FLR/USD feed used to price premiums in USD terms.
    function getFlrUsdPrice() external returns (uint256 value, int8 decimals, uint64 timestamp) {
        return getPrice(FEED_FLR_USD);
    }

    /// @notice Convenience getter for XRP/USD, used to gauge underlying-asset volatility for FXRP risk.
    function getXrpUsdPrice() external returns (uint256 value, int8 decimals, uint64 timestamp) {
        return getPrice(FEED_XRP_USD);
    }
}
