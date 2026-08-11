// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFtsoV2Interface
 * @notice Minimal, ABI-compatible mirror of Flare's on-chain FtsoV2Interface.
 *
 * We vendor this instead of pulling the full flarenetwork flare-periphery-contracts
 * npm package so the project compiles deterministically regardless of upstream package
 * churn. The function selectors below match the deployed FtsoV2 contract on
 * Coston2 / Flare mainnet, so this interface is safe to call against the real
 * contract address returned by the FlareContractRegistry.
 *
 * Docs: https://dev.flare.network/ftso/getting-started/
 */
interface IFtsoV2Interface {
    /// @notice Returns the latest value for a single feed by its 21-byte feed id.
    /// @param _feedId bytes21 feed identifier, e.g. FLR/USD = 0x01464c522f55534400000000000000000000000000
    /// @return value the feed value
    /// @return decimals number of decimals the value is scaled by
    /// @return timestamp unix timestamp the value was last updated
    function getFeedById(bytes21 _feedId)
        external
        payable
        returns (uint256 value, int8 decimals, uint64 timestamp);

    /// @notice Returns the latest value for a single feed, normalized to 18 decimals (wei-scale).
    function getFeedByIdInWei(bytes21 _feedId)
        external
        payable
        returns (uint256 value, uint64 timestamp);

    /// @notice Batch read of multiple feeds in one call.
    function getFeedsById(bytes21[] calldata _feedIds)
        external
        payable
        returns (uint256[] memory values, int8[] memory decimals, uint64 timestamp);
}
