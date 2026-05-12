// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../IArcGuard.sol";
import "../QuarantineVault.sol";

/**
 * @title ExampleDApp
 * @notice Example integration showing how any dApp on Arc can use ArcGuard
 *         for AML compliance with just a few lines of code.
 *
 *         Two integration modes are demonstrated:
 *         1. HARD BLOCK — transaction reverts if sender is flagged
 *         2. SOFT QUARANTINE — flagged funds go to QuarantineVault
 */
contract ExampleDApp {
    IArcGuard public arcGuard;
    QuarantineVault public quarantine;
    address public owner;

    mapping(address => uint256) public balances;

    event DepositAccepted(address indexed user, uint256 amount);
    event DepositQuarantined(address indexed user, uint256 amount, string reason);

    constructor(address _arcGuard, address payable _quarantine) {
        arcGuard = IArcGuard(_arcGuard);
        quarantine = QuarantineVault(_quarantine);
        owner = msg.sender;
    }

    // ═══════════════════════════════════════
    //   MODE 1: HARD BLOCK (revert if dirty)
    // ═══════════════════════════════════════

    /// @notice Modifier — add to any function to enforce AML check
    modifier screened(address sender) {
        require(arcGuard.isClean(sender), "ArcGuard: address flagged");
        _;
    }

    /// @notice Deposit with hard block — reverts if sender is flagged
    function depositHardBlock() external payable screened(msg.sender) {
        balances[msg.sender] += msg.value;
        emit DepositAccepted(msg.sender, msg.value);
    }

    // ═══════════════════════════════════════
    //   MODE 2: SOFT QUARANTINE (freeze funds)
    // ═══════════════════════════════════════

    /// @notice Deposit with soft quarantine — flagged funds go to vault
    function depositSoftQuarantine() external payable {
        if (arcGuard.isClean(msg.sender)) {
            // Clean sender — process normally
            balances[msg.sender] += msg.value;
            emit DepositAccepted(msg.sender, msg.value);
        } else {
            // Flagged sender — quarantine the funds
            string memory label = arcGuard.getEntityLabel(msg.sender);
            string memory reason = bytes(label).length > 0
                ? string(abi.encodePacked("ArcGuard flag: ", label))
                : "ArcGuard: address flagged";

            quarantine.lockFunds{value: msg.value}(msg.sender, reason);
            emit DepositQuarantined(msg.sender, msg.value, reason);
        }
    }

    // ═══════════════════════════════════════
    //   OPTIONAL: Check score before action
    // ═══════════════════════════════════════

    /// @notice Example: only allow withdrawals for low-risk users
    function withdraw(uint256 amount) external {
        uint8 score = arcGuard.getRiskScore(msg.sender);
        require(score < 50, "ArcGuard: risk too high for withdrawal");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }
}
