// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IArcGuard.sol";

/**
 * @title QuarantineVault
 * @author ArcGuard Protocol
 * @notice Escrow contract for quarantining funds from flagged addresses.
 *         When a dApp detects a dirty sender via ArcGuard, it sends the funds
 *         here instead of processing them. The business owner decides:
 *         - REFUND: return funds to sender (minus gas costs)
 *         - FREEZE: lock funds permanently (for law enforcement)
 *
 * Integration in a dApp:
 *
 *   function deposit(uint256 amount) external {
 *       if (arcGuard.isClean(msg.sender)) {
 *           processPayment(msg.sender, amount);
 *       } else {
 *           usdc.transferFrom(msg.sender, address(quarantineVault), amount);
 *           quarantineVault.lockFunds(msg.sender, amount, "AML flag");
 *       }
 *   }
 */
contract QuarantineVault {
    // ════════════════════════════════════════════
    //                  TYPES
    // ════════════════════════════════════════════

    enum QuarantineStatus { LOCKED, REFUNDED, FROZEN }

    struct QuarantineRecord {
        uint256 id;
        address sender;          // Who sent the flagged funds
        address dapp;            // Which dApp quarantined them
        uint256 amount;          // Amount in USDC (native on Arc)
        uint256 timestamp;       // When quarantined
        string reason;           // Why flagged
        QuarantineStatus status; // Current status
    }

    // ════════════════════════════════════════════
    //                  STATE
    // ════════════════════════════════════════════

    address public owner;
    IArcGuard public arcGuard;

    /// @notice All quarantine records
    QuarantineRecord[] public records;

    /// @notice Authorized dApps that can lock funds
    mapping(address => bool) public authorizedDApps;

    /// @notice Total USDC currently in quarantine
    uint256 public totalQuarantined;

    /// @notice Total records ever created
    uint256 public totalRecords;

    // ════════════════════════════════════════════
    //                  EVENTS
    // ════════════════════════════════════════════

    event FundsQuarantined(
        uint256 indexed id,
        address indexed sender,
        address indexed dapp,
        uint256 amount,
        string reason
    );
    event FundsRefunded(uint256 indexed id, address indexed sender, uint256 amount);
    event FundsFrozen(uint256 indexed id, address indexed sender, uint256 amount);
    event DAppAuthorized(address indexed dapp);
    event DAppRevoked(address indexed dapp);

    // ════════════════════════════════════════════
    //                 MODIFIERS
    // ════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "QuarantineVault: not owner");
        _;
    }

    modifier onlyAuthorizedDApp() {
        require(authorizedDApps[msg.sender], "QuarantineVault: not authorized dApp");
        _;
    }

    // ════════════════════════════════════════════
    //               CONSTRUCTOR
    // ════════════════════════════════════════════

    constructor(address _arcGuard) {
        owner = msg.sender;
        arcGuard = IArcGuard(_arcGuard);
    }

    // ════════════════════════════════════════════
    //            CORE FUNCTIONS
    // ════════════════════════════════════════════

    /// @notice Lock funds from a flagged sender (called by integrated dApp)
    /// @dev The dApp must transfer USDC to this contract BEFORE calling lockFunds.
    ///      On Arc, USDC is the native token so funds arrive via msg.value.
    /// @param sender The original sender whose funds are quarantined
    /// @param reason Why the funds were quarantined (e.g. "OFAC match", "mixer interaction")
    function lockFunds(address sender, string calldata reason) external payable onlyAuthorizedDApp {
        require(msg.value > 0, "QuarantineVault: no funds sent");

        uint256 id = records.length;

        records.push(QuarantineRecord({
            id: id,
            sender: sender,
            dapp: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            reason: reason,
            status: QuarantineStatus.LOCKED
        }));

        totalQuarantined += msg.value;
        totalRecords++;

        emit FundsQuarantined(id, sender, msg.sender, msg.value, reason);
    }

    /// @notice Refund quarantined funds to the original sender
    /// @param id The quarantine record ID
    function refund(uint256 id) external onlyOwner {
        require(id < records.length, "QuarantineVault: invalid id");
        QuarantineRecord storage record = records[id];
        require(record.status == QuarantineStatus.LOCKED, "QuarantineVault: not locked");

        record.status = QuarantineStatus.REFUNDED;
        totalQuarantined -= record.amount;

        // Transfer USDC (native) back to sender
        (bool success, ) = payable(record.sender).call{value: record.amount}("");
        require(success, "QuarantineVault: refund failed");

        emit FundsRefunded(id, record.sender, record.amount);
    }

    /// @notice Freeze quarantined funds permanently (for law enforcement coordination)
    /// @param id The quarantine record ID
    function freeze(uint256 id) external onlyOwner {
        require(id < records.length, "QuarantineVault: invalid id");
        QuarantineRecord storage record = records[id];
        require(record.status == QuarantineStatus.LOCKED, "QuarantineVault: not locked");

        record.status = QuarantineStatus.FROZEN;
        // Funds stay in contract — can be released by owner to authorities later

        emit FundsFrozen(id, record.sender, record.amount);
    }

    // ════════════════════════════════════════════
    //             VIEW FUNCTIONS
    // ════════════════════════════════════════════

    /// @notice Get a quarantine record
    function getRecord(uint256 id) external view returns (QuarantineRecord memory) {
        require(id < records.length, "QuarantineVault: invalid id");
        return records[id];
    }

    /// @notice Get total number of records
    function getRecordCount() external view returns (uint256) {
        return records.length;
    }

    // ════════════════════════════════════════════
    //            ADMIN FUNCTIONS
    // ════════════════════════════════════════════

    /// @notice Authorize a dApp to quarantine funds
    function authorizeDApp(address dapp) external onlyOwner {
        authorizedDApps[dapp] = true;
        emit DAppAuthorized(dapp);
    }

    /// @notice Revoke dApp authorization
    function revokeDApp(address dapp) external onlyOwner {
        authorizedDApps[dapp] = false;
        emit DAppRevoked(dapp);
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "QuarantineVault: zero address");
        owner = newOwner;
    }

    /// @notice Withdraw frozen funds (e.g. transfer to law enforcement)
    function withdrawFrozen(uint256 id, address to) external onlyOwner {
        require(id < records.length, "QuarantineVault: invalid id");
        QuarantineRecord storage record = records[id];
        require(record.status == QuarantineStatus.FROZEN, "QuarantineVault: not frozen");

        uint256 amount = record.amount;
        record.amount = 0;
        totalQuarantined -= amount;

        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "QuarantineVault: withdrawal failed");
    }

    /// @notice Accept native USDC
    receive() external payable {}
}
