// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IArcGuard.sol";

/**
 * @title ArcGuardRegistry
 * @author ArcGuard Protocol
 * @notice On-chain registry of flagged addresses and risk scores for the Arc Network.
 *         Fed by the off-chain ArcGuard Risk Engine via authorized operators.
 *
 * Architecture:
 *   Off-chain Engine (Node.js) → scans addresses → pushes scores here → dApps query in real-time
 *
 * Integration for dApps:
 *   require(arcGuard.isClean(sender), "ArcGuard: flagged");
 */
contract ArcGuardRegistry is IArcGuard {
    // ════════════════════════════════════════════
    //                  STATE
    // ════════════════════════════════════════════

    address public owner;
    mapping(address => bool) public operators; // Authorized to push scores

    /// @notice Risk score per address (0 = unknown/clean, 1-100 = scored)
    mapping(address => uint8) public riskScores;

    /// @notice Explicitly flagged addresses (blacklist)
    mapping(address => bool) public flagged;

    /// @notice Entity labels (e.g. "mixer", "casino_unlicensed", "sanctioned")
    mapping(address => string) public entityLabels;

    /// @notice Threshold above which an address is considered "not clean"
    uint8 public flagThreshold = 70;

    /// @notice Total number of flagged addresses (for stats)
    uint256 public totalFlagged;

    /// @notice Total number of scored addresses
    uint256 public totalScored;

    // ════════════════════════════════════════════
    //                  EVENTS
    // ════════════════════════════════════════════

    event AddressFlagged(address indexed addr, uint8 score, string label, address indexed operator);
    event AddressUnflagged(address indexed addr, address indexed operator);
    event ScoreUpdated(address indexed addr, uint8 oldScore, uint8 newScore, address indexed operator);
    event LabelUpdated(address indexed addr, string label, address indexed operator);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event ThresholdUpdated(uint8 oldThreshold, uint8 newThreshold);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ════════════════════════════════════════════
    //                 MODIFIERS
    // ════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "ArcGuard: not owner");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner, "ArcGuard: not authorized");
        _;
    }

    // ════════════════════════════════════════════
    //               CONSTRUCTOR
    // ════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
        operators[msg.sender] = true;
        emit OperatorAdded(msg.sender);
    }

    // ════════════════════════════════════════════
    //            IArcGuard INTERFACE
    // ════════════════════════════════════════════

    /// @inheritdoc IArcGuard
    function isClean(address addr) external view override returns (bool) {
        if (flagged[addr]) return false;
        if (riskScores[addr] >= flagThreshold) return false;
        return true;
    }

    /// @inheritdoc IArcGuard
    function getRiskScore(address addr) external view override returns (uint8) {
        return riskScores[addr];
    }

    /// @inheritdoc IArcGuard
    function getEntityLabel(address addr) external view override returns (string memory) {
        return entityLabels[addr];
    }

    // ════════════════════════════════════════════
    //          OPERATOR FUNCTIONS (write)
    // ════════════════════════════════════════════

    /// @notice Update the risk score for an address
    /// @param addr Target address
    /// @param score Risk score 0-100
    function setScore(address addr, uint8 score) external onlyOperator {
        require(score <= 100, "ArcGuard: score must be 0-100");
        uint8 oldScore = riskScores[addr];

        if (oldScore == 0 && score > 0) totalScored++;
        if (oldScore > 0 && score == 0) totalScored--;

        riskScores[addr] = score;
        emit ScoreUpdated(addr, oldScore, score, msg.sender);

        // Auto-flag if score exceeds threshold
        if (score >= flagThreshold && !flagged[addr]) {
            flagged[addr] = true;
            totalFlagged++;
            emit AddressFlagged(addr, score, entityLabels[addr], msg.sender);
        }
    }

    /// @notice Batch update scores (gas-efficient for engine syncs)
    /// @param addrs Array of addresses
    /// @param scores Array of scores (must match addrs length)
    function batchSetScores(address[] calldata addrs, uint8[] calldata scores) external onlyOperator {
        require(addrs.length == scores.length, "ArcGuard: length mismatch");
        require(addrs.length <= 100, "ArcGuard: max 100 per batch");

        for (uint256 i = 0; i < addrs.length; i++) {
            require(scores[i] <= 100, "ArcGuard: score must be 0-100");
            uint8 oldScore = riskScores[addrs[i]];

            if (oldScore == 0 && scores[i] > 0) totalScored++;
            riskScores[addrs[i]] = scores[i];

            if (scores[i] >= flagThreshold && !flagged[addrs[i]]) {
                flagged[addrs[i]] = true;
                totalFlagged++;
                emit AddressFlagged(addrs[i], scores[i], entityLabels[addrs[i]], msg.sender);
            }

            emit ScoreUpdated(addrs[i], oldScore, scores[i], msg.sender);
        }
    }

    /// @notice Manually flag an address with a label
    /// @param addr Target address
    /// @param score Risk score
    /// @param label Entity label (e.g. "sanctioned", "mixer", "casino_unlicensed")
    function flagAddress(address addr, uint8 score, string calldata label) external onlyOperator {
        require(score <= 100, "ArcGuard: score must be 0-100");

        if (riskScores[addr] == 0) totalScored++;
        riskScores[addr] = score;
        entityLabels[addr] = label;

        if (!flagged[addr]) {
            flagged[addr] = true;
            totalFlagged++;
        }

        emit AddressFlagged(addr, score, label, msg.sender);
    }

    /// @notice Remove flag from an address (unflag)
    /// @param addr Target address
    function unflagAddress(address addr) external onlyOperator {
        require(flagged[addr], "ArcGuard: not flagged");
        flagged[addr] = false;
        riskScores[addr] = 0;
        totalFlagged--;
        emit AddressUnflagged(addr, msg.sender);
    }

    /// @notice Set entity label without changing score
    /// @param addr Target address
    /// @param label Entity label
    function setLabel(address addr, string calldata label) external onlyOperator {
        entityLabels[addr] = label;
        emit LabelUpdated(addr, label, msg.sender);
    }

    // ════════════════════════════════════════════
    //            ADMIN FUNCTIONS
    // ════════════════════════════════════════════

    /// @notice Add an authorized operator (e.g. backend engine wallet)
    function addOperator(address operator) external onlyOwner {
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    /// @notice Remove an operator
    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    /// @notice Update the flag threshold
    function setThreshold(uint8 newThreshold) external onlyOwner {
        require(newThreshold > 0 && newThreshold <= 100, "ArcGuard: invalid threshold");
        uint8 oldThreshold = flagThreshold;
        flagThreshold = newThreshold;
        emit ThresholdUpdated(oldThreshold, newThreshold);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ArcGuard: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
