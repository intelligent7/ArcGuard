// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IArcGuard
 * @notice Interface for ArcGuard on-chain compliance.
 *         Any dApp on Arc can integrate ArcGuard in ONE line using the modifier below.
 *
 * Usage in your dApp:
 *
 *   import "./IArcGuard.sol";
 *
 *   contract MyDApp {
 *       IArcGuard public guard;
 *       constructor(address _guard) { guard = IArcGuard(_guard); }
 *
 *       modifier screened(address sender) {
 *           require(guard.isClean(sender), "ArcGuard: address flagged");
 *           _;
 *       }
 *
 *       function deposit(uint256 amount) external screened(msg.sender) {
 *           // This will only execute if sender passes AML check
 *       }
 *   }
 */
interface IArcGuard {
    /// @notice Check if an address is clean (not flagged)
    /// @param addr The address to check
    /// @return True if the address is NOT flagged
    function isClean(address addr) external view returns (bool);

    /// @notice Get the risk score for an address (0-100)
    /// @param addr The address to query
    /// @return Risk score from 0 (safe) to 100 (critical)
    function getRiskScore(address addr) external view returns (uint8);

    /// @notice Get the entity label for an address
    /// @param addr The address to query
    /// @return Entity label string (e.g. "casino_unlicensed", "mixer", "clean")
    function getEntityLabel(address addr) external view returns (string memory);
}
