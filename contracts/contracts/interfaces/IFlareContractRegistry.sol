// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFtsoV2Interface.sol";

/**
 * @title IFlareContractRegistry
 * @notice Mirrors Flare's canonical on-chain registry so every core protocol
 * contract (FtsoV2, FDC verification, etc.) can be looked up dynamically
 * instead of hardcoding addresses that differ between networks.
 *
 * The registry itself lives at the SAME address on every Flare network
 * (mainnet, Coston2, Songbird, Coston):
 *   0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
 *
 * Docs: https://docs.flare.network/dev/getting-started/contract-addresses/
 */
interface IFlareContractRegistry {
    function getContractAddressByName(string calldata _name) external view returns (address);

    function getFtsoV2() external view returns (IFtsoV2Interface);
}
