// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FluxPayAudit
 * @dev Audit contract for recording payment intents, settlements, and refunds.
 * Does not hold funds; serves as tamper-evident record for Nexus settlements.
 */
contract FluxPayAudit is AccessControl {
    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");

    struct Intent {
        address payer;
        uint256 lockedAmount;
        uint256 expiry;
        bool settled;
        bool refunded;
    }

    mapping(bytes32 => Intent) public intents;

    event IntentLocked(
        bytes32 indexed intentId,
        address indexed payer,
        uint256 lockedAmount,
        uint256 expiry
    );

    event IntentSettled(
        bytes32 indexed intentId,
        address indexed provider,
        uint256 usedAmount,
        bytes nexusTx
    );

    event IntentRefunded(
        bytes32 indexed intentId,
        bytes nexusTx
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyGateway() {
        require(hasRole(GATEWAY_ROLE, msg.sender), "Only gateway can call");
        _;
    }

    /**
     * @dev Records an intent creation, called after Nexus.createIntent success
     * @param intentId Unique intent identifier
     * @param payer Address locking funds
     * @param lockedAmount Amount locked in smallest units
     * @param expiry Timestamp when intent expires
     */
    function recordIntent(
        bytes32 intentId,
        address payer,
        uint256 lockedAmount,
        uint256 expiry
    ) external onlyGateway {
        require(intents[intentId].payer == address(0), "Intent already exists");

        intents[intentId] = Intent({
            payer: payer,
            lockedAmount: lockedAmount,
            expiry: expiry,
            settled: false,
            refunded: false
        });

        emit IntentLocked(intentId, payer, lockedAmount, expiry);
    }

    /**
     * @dev Records a settlement, called after Nexus.settle confirms
     * @param intentId The settled intent
     * @param provider Provider receiving payment
     * @param usedAmount Actual amount transferred
     * @param nexusTx Transaction hash/ID from Nexus
     */
    function recordSettlement(
        bytes32 intentId,
        address provider,
        uint256 usedAmount,
        bytes calldata nexusTx
    ) external onlyGateway {
        require(!intents[intentId].settled, "Already settled");
        require(!intents[intentId].refunded, "Already refunded");
        require(usedAmount <= intents[intentId].lockedAmount, "Used more than locked");

        intents[intentId].settled = true;

        emit IntentSettled(intentId, provider, usedAmount, nexusTx);
    }

    /**
     * @dev Records a refund, called after Nexus.refund confirms
     * @param intentId The refunded intent
     * @param nexusTx Transaction hash/ID from Nexus
     */
    function recordRefund(
        bytes32 intentId,
        bytes calldata nexusTx
    ) external onlyGateway {
        require(!intents[intentId].settled, "Cannot refund settled intent");
        require(!intents[intentId].refunded, "Already refunded");

        intents[intentId].refunded = true;

        emit IntentRefunded(intentId, nexusTx);
    }

    /**
     * @dev Batch record multiple events for gas efficiency
     */
    function batchRecordSettlements(
        bytes32[] calldata intentIds,
        address[] calldata providers,
        uint256[] calldata usedAmounts,
        bytes[] calldata nexusTxs
    ) external onlyGateway {
        require(
            intentIds.length == providers.length &&
            providers.length == usedAmounts.length &&
            usedAmounts.length == nexusTxs.length,
            "Array lengths mismatch"
        );

        for (uint256 i = 0; i < intentIds.length; i++) {
            recordSettlement(intentIds[i], providers[i], usedAmounts[i], nexusTxs[i]);
        }
    }

    /**
     * @dev Check if intent is expired
     */
    function isExpired(bytes32 intentId) external view returns (bool) {
        return block.timestamp > intents[intentId].expiry;
    }

    /**
     * @dev Get intent details
     */
    function getIntent(bytes32 intentId) external view returns (
        address payer,
        uint256 lockedAmount,
        uint256 expiry,
        bool settled,
        bool refunded
    ) {
        Intent memory intent = intents[intentId];
        return (
            intent.payer,
            intent.lockedAmount,
            intent.expiry,
            intent.settled,
            intent.refunded
        );
    }
}
