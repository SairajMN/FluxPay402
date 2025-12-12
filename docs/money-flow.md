# FluxPay Nexus Money Flow

## Complete End-to-End Transaction Flow

### Canonical Example: AI Chat Completion
**Scenario**: User requests GPT-4o-mini completion, expects ~0.007 USDC cost, locks 0.05 USDC.

```
User Balance: 100.0 USDC (Unified across chains)
↓
Lock 0.05 USDC → Nexus Intent (fluxpay:abc123)
↓
Intent Status: LOCKED | Amount: 0.05 USDC | Expires: T+5min
↓
AI Call succeeds → Provider receipts → Gateway validates
↓
Settle 0.007 USDC → Provider (Arbitrum) + Refund 0.043 USDC → User
↓
Final: User Balance 100.043 USDC | Provider +0.007 USDC
```

## Step-by-Step Money Flow

### Phase 1: Intent Creation & Fund Locking
```
1. User calls /api/ai/chat → HTTP 402 Challenge
2. Gateway estimates: maxBudget = 0.05 USDC
3. User executes: nexus.createIntent({
     intentId: "fluxpay:abc123",
     payerAddress: userWallet,
     token: "USDC",
     amount: 0.05e6,  // 6 decimals
     expiry: now + 300
   })
4. Nexus locks funds from user's unified balance
5. Gateway records: FluxPayAudit.recordIntent(abc123, userWallet, 0.05e6, expiry)
```

### Phase 2: Provider Execution & Receipt Generation
```
6. Gateway proxies: POST provider:4000/process → {intentId: abc123, prompt: "..."}
7. Provider calls: OpenRouter.chat.completions → model: gpt-4o-mini
8. OpenRouter responds: {usage: {prompt_tokens: 100, completion_tokens: 50}}
9. Provider calculates: usage_cost = (100+50) tokens × (0.00006 + 0.00024) = 0.007 USDC
10. Provider signs receipt:
    {
      intentId: "fluxpay:abc123",
      usedAmount: 0.007e6,
      tokensUsed: 150,
      provider: providerAddress,
      payoutChain: "arbitrum",
      nonce: generateNonce(),
      timestamp: now,
      signature: sign(receipt, providerKey)
    }
```

### Phase 3: Settlement & Cross-Chain Routing
```
11. Gateway validates receipt signature & nonce
12. Gateway cross-references against OpenRouter usage
13. Gateway calls: nexus.settleIntent({
      intentId: "fluxpay:abc123",
      recipient: providerAddress,
      amount: 0.007e6,
      targetChain: "arbitrum",
      targetToken: "USDC"
    })
14. Nexus routes payment:
    - If user chain == arbitrum: direct transfer
    - If different: cross-chain swap/bridge via integrated DEXs
15. Gateway records: FluxPayAudit.recordSettlement(abc123, provider, 0.007e6, nexusTx)
16. Gateway returns API response + settlement metadata
```

### Phase 4: Automatic Refund of Overpayment
```
17. Nexus refunds: intentBalance - settledAmount = 0.05e6 - 0.007e6 = 0.043e6
18. Returned to user's unified balance (same chain or user preference)
19. Gateway records: FluxPayAudit.recordRefund(abc123, refundTx) if timeout
20. Final state: Intent settled, receipts anchored to Avail DA
```

## Cross-Chain Settlement Scenarios

### Scenario 1: Same Chain (Direct Transfer)
```
User Chain: Ethereum | Provider Chain: Ethereum
↓
Nexus.settle() → ERC20.transfer() on Ethereum
Cost: ~$0.01 gas | Time: ~15 seconds
```

### Scenario 2: Different Chains (Bridge Required)
```
User Chain: Ethereum | Provider Chain: Arbitrum
↓
Nexus.settle() → Bridge via Arbitrum Bridge or Hop Protocol
   → Optimistic verification → Final transfer on Arbitrum
Cost: ~$1-5 + gas | Time: ~1-5 minutes
```

### Scenario 3: Multiple Swaps (Complex Routing)
```
User Chain: Polygon | Provider Chain: Avalanche
↓
Nexus routing engine finds optimal path:
Polygon → Ethereum (cheap bridge) → Avalanche
OR
Polygon → Arbitrum → Avalanche (better liquidity)
Cost: ~$2-10 + gas | Time: ~2-10 minutes
```

## Refund Scenarios & Automatic Execution

### Timeout Refund (SLA Violation)
```
Conditions: No receipt received before expiry (default: 30s)
↓
Gateway cron calls: nexus.refundIntent(intentId)
↓
Full refund: 0.05e6 USDC → User unified balance
↓
Audit record: IntentRefunded(intentId, refundTx)
```

### Provider Failure Refund
```
Conditions: OpenRouter error, provider crash, invalid receipt
↓
Gateway catches exception → nexus.refundIntent(intentId)
↓
Full refund: intentAmount → User unified balance
↓
Response: 502 Bad Gateway + "Funds automatically refunded"
```

### Partial Settlement + Refund (Overpayment)
```
Intent: 0.05 USDC | Actual Usage: 0.007 USDC
↓
Settlement: 0.007 USDC → Provider
↓
Automatic refund: 0.043 USDC → User
↓
0% fee retained by Nexus for cross-chain operations
```

## Unified Balance Management

### User Balance Tracking
```
User Wallet (EOA/Account Abstraction)
    ↓
Nexus Unified Balance: Maps across 10+ chains
    ↓
USDC balances aggregated:
  - Ethereum: 50.0
  - Polygon: 25.0
  - Arbitrum: 15.0
  - Avalanche: 10.0
  Total: 100.0 USDC
```

### Provider Payout Routing
```
Provider specifies: payoutChain + payoutToken
↓
Nexus attempts optimal routing:
1. Direct transfer (if same chain)
2. Bridge + transfer (if different chains)
3. DEX swap + transfer (if token mismatch)
↓
If payoutChain congested: Escalate to higher-gas alternative chains
```

## Fee Structure & Revenue Model

### User-Facing Fees
```
Base: 0.0% (trust-minimized, no platform fees)
Gas: User pays cross-chain bridging costs (market rate)
Refunds: 100% automatic, no deduction
```

### Provider Platform Fees
```
Per-transaction: 0.1% (taken during settlement)
Monthly minimum: $10 (after $1000 volume)
```

### Gateway Operational Costs
```
Infrastructure: $500-2000/month (Node.js, Redis, PostgreSQL)
Smart contract gas: ~$100/day for mainnet interactions
Avail DA anchoring: $50/month for proof storage
OpenRouter API: Volume-based pricing (passed through)
```

## Money Flow Diagrams

### Standard Payment Flow
```
[User Unified Balance]
        │
        │ 1. Lock Funds
        ▼
[Nexus Intent: LOCKED] ─────────► [HTTP 402 Challenge]
        │                           Failed
        │ Success                       ▼
        │                          [Client Retries]
        ▼
[Provider Processing] ─────────► [OpenRouter Call]
        │                           Timed out
        │ Receipt                      ▼
        ▼                          [Automatic Refund]
[Nexus Settlement] ────────────► [Provider Payout]
        │
        ▼
[Remainder Refund] ───────────► [User Unified Balance]
```

### Cross-Chain Routing Matrix
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ From Chain  │ │   Method    │ │ Est. Time   │ │ Est. Cost   │
├─────────────┼─┼─────────────┼─┼─────────────┼─┼─────────────┤
│ Same Chain  │ │ Direct      │ │ 15s         │ │ $0.01       │
├─────────────┼─┼─────────────┼─┼─────────────┼─┼─────────────┤
│ L2 ↔ L2     │ │ Bridge      │ │ 1-3 min     │ │ $0.50-2     │
├─────────────┼─┼─────────────┼─┼─────────────┼─┼─────────────┤
│ L1 ↔ L2     │ │ Bridge+Verif│ │ 1-5 min     │ │ $1-5        │
├─────────────┼─┼─────────────┼─┼─────────────┼─┼─────────────┤
│ Multi-hop   │ │ Bridge×2    │ │ 5-15 min    │ │ $5-20       │
└─────────────┴─┴─────────────┴─┴─────────────┴─┴─────────────┘
```

## Failure Modes & Recovery

### Network Congestion
```
Problem: Target chain congested (>200 gwei)
↓
Nexus detects high fees → Alternative routing
↓
Escalate to cheaper chains with same token support
↓
Provider notified of final destination chain
```

### Bridge Failure
```
Problem: Bridge temporarily down
↓
Nexus retries through alternative bridges
↓
If all fail: Hold settlement until resolved
↓
User funds remain locked, SLA clock paused
```

### Provider Disconnection
```
Problem: Provider service unreachable
↓
Timeout triggered after SLA period
↓
nexus.refundIntent(intentId) executed
↓
Client receives 502 + "Funds refunded automatically"
```

## Economic Security Model

### Trust Assumptions Minimized
```
✓ Funds never controlled by gateway (Nexus escrow)
✓ Provider claims verified against OpenRouter proofs
✓ All settlements recorded on-chain (tamper-evident)
✓ Refunds guaranteed by smart contract + Nexus
✓ Cross-chain routing via audited bridge protocols
```

### Attack Vector Mitigation
```
Double-spend: Nonce replay protection
Provider fraud: Usage cross-verification
Network failure: Unified balances survive outages
Oracle attacks: Multi-source usage validation
Smart contract bugs: Circuit breakers + escape hatches
```

## Revenue Projections (4-Day Hackathon MVP)

### Day 1-2: Internal Testing
```
Volume: 100 test transactions
Revenue: $0 (internal)
User growth: 5-10 developers
```

### Day 3-4: Public Demo
```
Volume: 1000+ demo calls
Revenue: $15-30 from provider testing fees
User growth: 50+ early adopters
```

### Month 1 Post-Launch
```
Volume: 10,000 transactions/day
Revenue: $300/day ($9,000/month)
Active users: 200 developers + APIs
Active providers: 20 AI/API services
```

### Year 1 Projections
```
Volume: 1M+ transactions/day
Revenue: $15,000/month (0.1% fee)
Active users: 10,000+ developers + autonomous agents
Active providers: 200+ AI/API marketplaces
Market capture: 5-10% of high-value API payments
