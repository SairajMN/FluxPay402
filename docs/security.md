# FluxPay Nexus Security & Trust Minimization

## Core Security Principles

### Trust-Minimized Design
```
💰 FUNDS: Never controlled by gateway (Nexus escrow only)
🔒 VALIDATION: Provider claims verified against third-party proofs
📝 AUDIT: All settlements recorded immutably on-chain
♻️ REFUNDS: Guaranteed by smart contracts + automatic execution
🌉 BRIDGING: Only audited cross-chain protocols used
```

## Refund Logic - Automatic & Permissionless

### Refund Triggers
**Timeout Refund (Primary Mechanism)**
```
Intent Expiry + No Receipt → Automatic Full Refund
├── SLA Timeout: 30 seconds (default, provider-configurable)
├── Intent Status: LOCKED (not SETTLED)
├── Trigger: Gateway cron job every 30 seconds
├── Action: nexus.refundIntent(intentId)
└── Result: 100% refund to user unified balance
```

**Failure Refund (Error Handling)**
```
Provider Error/Crash → Immediate Refund
├── Exceptions: OpenRouter timeout, provider crash, invalid response
├── Detection: Gateway try-catch blocks
├── Action: nexus.refundIntent() in finally block
├── Client Response: 502 + "Funds automatically refunded"
└── Audit: IntentRefunded event emitted
```

**Overpayment Refund (Automatic)**
```
Settlement < Intent Amount → Remainder Refund
├── Amount Used: 0.007 USDC (actual)
├── Intent Locked: 0.050 USDC (budget)
├── Remainder: 0.043 USDC
├── Process: Nexus settles exact usage, refunds remainder
└── Timing: Instant (part of settle() operation)
```

### Refund Implementation Details

#### SLA Timeout Enforcement
```javascript
// gateway.js - SLA monitoring
async function checkTimeouts() {
  const now = Date.now() / 1000;
  for (const [intentId, intent] of activeIntents.entries()) {
    if (intent.status === 'PROCESSING' && now > intent.expiry) {
      console.log(`SLA Violation: Refunding intent ${intentId}`);
      await nexusAdapter.refundIntent(intentId);
      await recordRefundToAudit(intentId); // On-chain record
      activeIntents.delete(intentId);
    }
  }
}
```

#### Provider SLA Configuration
```javascript
// Provider sets SLA per endpoint (seconds)
pricingRules[endpointHash] = {
  minBudget: 0.001e6,
  maxBudget: 0.05e6,
  basePrice: 0.0005e6,
  pricePerToken: 0.00006e6,
  pricePerKb: 0.001e6,
  slaTimeout: 30 // Seconds before refund triggers
};
```

### Refund Security Guarantees
```
✅ Permissionless: No admin approval required
✅ Automatic: Cron jobs + exception handling
✅ Full Amount: No fees deducted from refunds
✅ Fast: Typically <15 seconds after trigger
✅ Verifiable: All refunds recorded on-chain
```

## Dispute Logic & Resolution

### Dispute Categories
**Provider Under-Charging (User Complaint)**
```
User Claims: Provider charged less than actual usage
Evidence: OpenRouter usage proof vs provider receipt
Resolution: Receipt anchoring proves provider honesty
```

**Provider Over-Charging (User Complaint)**
```
User Claims: Provider charged more than OpenRouter usage
Evidence: Gateway cross-verification during settlement
Resolution: Transaction rejected at settlement phase
```

**Service Quality Disputes (User Complaint)**
```
User Claims: Poor output despite payment
Evidence: Receipt shows usage delivered
Resolution: Subjective - community arbitration
```

**Gateway Errors (Rare)**
```
User Claims: Refund not processed
Evidence: On-chain records + receipt proofs
Resolution: Manual intervention if on-chain record missing
```

### Evidence System - Avail DA Anchoring

#### Receipt Anchoring Process
```
Settlement Batch (every 10 minutes)
├── Collect: Last 1000 receipts
├── Merkle Root: createReceiptsMerkleRoot(receipts)
├── DA Anchor: nexus.anchorProof(root, batchMetadata)
├── Proof Availability: 31/32 Avail validator confirmations
└── Public Access: Query via Avail light client
```

#### Verifiable Receipt Structure
```javascript
class VerifiableReceipt {
  constructor(receipt) {
    this.data = receipt; // Full signed receipt
    this.merkleProof = null; // Set during batching
    this.daAnchor = null; // Avail DA proof
    this.blockNumber = null; // Blockchain confirmation
  }

  // Verify against stored batch
  verifyAgainstProof(proof) {
    const leafHash = crypto.createHash('sha256')
      .update(JSON.stringify(this.data, Object.keys(this.data).sort()))
      .digest('hex');

    return verifyMerkleProof(leafHash, proof.proof, proof.root);
  }
}
```

### Arbitration Framework
**Phase 1: Automated Resolution**
```
Evidence Review:
├── Provider signature validity ✓
├── OpenRouter usage cross-reference ✓
├── Receipt anchoring proof ✓
├── SLA compliance check ✓
└── Smart contract state verification ✓
```

**Phase 2: Community Arbitration (Escalation)**
```
For subjective disputes:
├── Evidence: All parties submit Merkle proofs
├── Arbitrators: Random selection from provider pool
├── Voting: 51% majority required
├── Bond: 10% of disputed amount locked
└── Resolution: Winning party receives bond + disputed amount
```

## Security Attack Vectors & Mitigations

### Double-Spend Protection
**Attack**: Replay same intent multiple times
**Mitigation**:
```
- Intent state tracking (LOCKED → SETTLED/REFUNDED)
- On-chain intent validation via FluxPayAudit.getIntent()
- Once settled, intent permanently locked
```

### Provider Fraud Prevention
**Attack**: Provider claims inflated usage amounts
**Mitigation**:
```
- OpenRouter usage verification: server-side cross-check
- Receipt signature verification: cryptographically binding
- Tolerance checks: 1% variance allowed, flagged beyond
- On-chain audit trail: immutable settlement records
```

### Replay Attack Protection
**Attack**: Reuse signed receipts across intents
**Mitigation**:
```
- Unique nonce per receipt (UUID + timestamp)
- Nonce tracking with expiration (24-hour TTL)
- Receipt field: intentId binding prevents reuse
- Provider key rotation support
```

### Sybil Attack Prevention
**Attack**: Fake providers registering to steal traffic
**Mitigation**:
```
- ProviderRegistry smart contract validation
- KYC optional but recommended for high-volume
- Community reputation system
- Bond requirements for arbitration participation
```

### Cross-Chain Attack Vectors
**Attack**: Bridge exploit during settlement
**Mitigation**:
```
- Only audited bridge protocols (Arbitrum, Polygon Bridge, etc.)
- Nexus SDK handles bridge security
- Settlement monitoring with automatic pause on anomalies
- User funds protected by Nexus escrow during transit
```

## Cryptographic Security

### Receipt Signing Process
**Deterministic Serialization**:
```javascript
const receipt = {
  intentId: "fluxpay:abc123",
  usedAmount: 0.007e6,
  tokensUsed: 150,
  endpointHash: hash(endpoint),
  nonce: generateNonce(),
  timestamp: Math.floor(Date.now() / 1000),
  provider: providerAddress,
  payoutChain: "arbitrum"
};

// Sort keys for deterministic signing
const sortedReceipt = Object.keys(receipt)
  .sort()
  .reduce((obj, key) => {
    obj[key] = receipt[key];
    return obj;
  }, {});

// Sign using ethers.js
const message = JSON.stringify(sortedReceipt);
const signature = await wallet.signMessage(message);
receipt.signature = signature;
```

**Signature Verification**:
```javascript
const recoveredAddress = ethers.verifyMessage(message, signature);
const valid = recoveredAddress.toLowerCase() === providerAddress.toLowerCase();
```

### Merkle Tree Construction for Batches
**Batch Anchoring Process**:
```javascript
function createReceiptsMerkleRoot(receipts) {
  const sortedReceipts = receipts.sort((a, b) => a.intentId.localeCompare(b.intentId));

  // Create leaf hashes
  const leaves = sortedReceipts.map(receipt => {
    const serialized = JSON.stringify(receipt, Object.keys(receipt).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  });

  // Build Merkle tree (binary reduction)
  while (leaves.length > 1) {
    const newLeaves = [];
    for (let i = 0; i < leaves.length; i += 2) {
      const left = leaves[i];
      const right = leaves[i + 1] || left; // Duplicate if odd
      const combined = crypto.createHash('sha256')
        .update(left + right)
        .digest('hex');
      newLeaves.push(combined);
    }
    leaves.splice(0, leaves.length, ...newLeaves);
  }

  return leaves[0]; // Root hash
}
```

## Operational Security

### Gateway Security Monitoring
**Circuit Breakers**:
```
- High Error Rate: Pause new intents (>5% failure rate)
- Bridge Failures: Escalate to manual settlement
- DA Unavailable: Queue receipts for later anchoring
- Provider Offline: Mark inactive, trigger refund wave
```

**Rate Limiting**:
```
- Per User: 10 intents/minute (prevent spam)
- Per Provider: 100 calls/minute (SLA protection)
- Global: 1000 transactions/second (DDoS protection)
```

### Incident Response Plan
**Security Breach Response**:
```
1. Immediate: Pause gateway (circuit breaker)
2. Assessment: Cross-reference all recent settlements
3. Refund: Automatic refund of suspicious transactions
4. Fix: Deploy patched contracts/functions
5. Resume: Gradual rollout with monitoring
6. Report: Public disclosure + proof of resolution
```

### Redundancy & Failover
**Hot Standby Architecture**:
```
- Multiple Gateway Instances: Load balanced
- Database Replication: Redis/PostgreSQL clusters
- Nexus SDK: Multiple API key rotation
- DA Anchoring: Batch retry with exponential backoff
```

## Trust Assumptions

### Minimized Trust Model
```
Client trusts:
- Ethereum/Arbitrum/Polygon consensus (~$100M economic security)
- Avail DA data availability (~32 honest validators)
- Nexus unified balances (audited SDK + escrow)
- OpenRouter usage honesty (revenue-aligned)

Client does NOT trust:
- Gateway operators (funds never controlled)
- Provider honesty (verified by third-party)
- Single blockchain (multi-chain redundancy)
- Central authority (permissionless refunds)
```

### Economic Incentives Alignment
```
All participants financially incentivized for honest behavior:
- Users: Refunds when service fails
- Providers: Payments only for delivered service
- Nexus: Fee per successful transaction
- Network: Transaction fees from settlements
```

## Compliance & Legal Framework

### Regulatory Compliance
**AML/KYC Handling**:
```
- Optional for small providers ($<10k/month)
- Required for large providers (>$100k/month)
- User privacy preserved (no personal data collection)
- GDPR/CCPA compliance (minimal data retention)
```

### Dispute Resolution Jurisdiction
```
Primary: On-chain evidence + smart contract execution
Secondary: Community arbitration (decentralized)
Final: Swiss/Ethereum arbitration (traditional law)
```

## Future Security Enhancements

### Advanced Features
```
- Multi-sig provider keys (2/3 requirement)
- Time-locked dispute periods
- Decentralized arbitration courts
- Insurance fund for edge case losses
- Formal verification of critical functions
```

### Monitoring & Analytics
```
- Real-time SLA dashboard
- Provider performance scoring
- Chain congestion monitoring
- Cross-chain success rate tracking
- Automated incident detection
