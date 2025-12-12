# x402 and Nexus Usage Guide in FluxPay

## Overview

FluxPay implements a trust-minimized micropayments system for APIs using the **HTTP 402 Payment Required** protocol (x402) and **Avail Nexus** for cross-chain unified balances. This guide explains the usage and flow of these two core components.

## What is x402?

x402 refers to the HTTP 402 Payment Required flow - a challenge-response mechanism for real-time API micropayments. Instead of traditional API keys, consumers pay for each request using blockchain-based payments, enabling true "pay-per-use" models.

### Key Characteristics
- **HTTP Standard**: Based on RFC 7235 (1997), extending HTTP with payment requirements
- **Challenge-Response**: Server challenges client with payment details, client pays, retries with proof
- **Real-Time**: Payment locked before service delivery, with guaranteed refunds on service failure
- **API Agnostic**: Works with any REST API, not limited to AI services

### Why HTTP 402?

Traditional API monetization has major limitations:
- **API Keys**: Shared among users, no per-request attribution
- **Post-Paid Billing**: Complex reconciliation, high risk of non-payment
- **Subscription Models**: One-size-fits-all, poor for variable usage
- **Cross-Chain Complexity**: Developers can't easily accept payments from any blockchain

HTTP 402 solves this by treating payment as part of the HTTP protocol itself.

## What is Nexus?

Avail Nexus provides **unified cross-chain balances** - a single wallet abstraction that aggregates balances across multiple blockchains (Ethereum, Polygon, Arbitrum, Avalanche, etc.). Payments can be made or received on any supported chain without manual bridging.

### Key Features
- **Unified Balance**: 100 USDC total across all chains appears as one balance
- **Automatic Routing**: Payments routed via optimal path (direct, bridge, multi-hop)
- **Intent-Based**: Lock funds before settlement, enabling conditional payments
- **Escrow Security**: Funds held securely during cross-chain operations

### Without Nexus (Complex)
```javascript
// User must manually bridge funds for each payment
const chain = getProviderChain();
if (userChain !== chain) {
  await bridgeTokens(userChain, chain, amount);
}
await payOnSpecificChain(amount, provider);
```

### With Nexus (Simple)
```javascript
// Unified balance handles everything automatically
await nexus.createIntent({
  amount: amount,
  token: "USDC"
  // Nexus finds and uses optimal path automatically
});
```

## The Complete Flow

### Phase 1: Client Request (No Payment)
```
Client                    Server
  │                          │
  │  POST /api/ai/chat       │
  │  (no payment)            │
  │─────────────────────────►│
  │                          │
  │  ◄───────────────────────┤
  │   HTTP 402 Payment       │
  │   Required               │
  │   {                      │
  │     "challengeType": "x402",
  │     "intentId": "fluxpay:abc123",
  │     "maxBudget": "0.05",
  │     "token": "USDC",
  │     "expiresAt": 1719600000,
  │     "instructions": { ... }
  │   }
```

### Phase 2: Nexus Intent Creation
```javascript
// Client executes payment using Nexus SDK
import { NexusSDK } from '@avail-project/nexus';

const nexus = new NexusSDK({ config });

const result = await nexus.intent.create({
  intentId: "fluxpay:abc123",
  payerAddress: userWallet,
  token: "USDC",
  amount: 0.05e6,  // 6 decimals (0.05 USDC)
  expiry: 5 * 60 * 1000  // 5 minutes
});

// Funds locked in unified balance across chains
console.log('Intent created with tx:', result.transactionHash);
```

### Phase 3: Gateway Validation & Processing
```
Client                    Gateway                     Provider
  │                          │                          │
  │  POST /api/ai/chat       │                          │
  │  Headers:                │                          │
  │    Payment-Evidence:     │                          │
  │      {intentId, nexusTx} │                          │
  │─────────────────────────►│                          │
  │                          │ ────► Validate Intent ──►│
  │                          │     LOCKED status        │
  │                          │                          │
  │                          │ ◄────────────────────────┤
  │                          │    Process AI request    │
  │                          │    via OpenRouter        │
  │                          │                          │
  │                          │ ◄────────────────────────┤
  │                          │    Signed Receipt        │
  │◄─────────────────────────┤                          │
  │     AI Response +        │                          │
  │     Settlement Info      │                          │
```

### Phase 4: Cross-Chain Settlement
```javascript
// Gateway executes settlement
await nexus.settleIntent({
  intentId: "fluxpay:abc123",
  recipient: providerAddress,      // Arbitrum:0x123...
  amount: 0.007e6,                 // Actual usage cost
  targetChain: "arbitrum",
  targetToken: "USDC"
});

// Nexus automatically:
// 1. Selects optimal route (e.g., ETH → ARB bridge)
// 2. Executes cross-chain transfer
// 3. Refunds remainder (0.05 - 0.007 = 0.043 USDC)
// 4. Records on-chain audit trail
```

## Code Examples

### Consumer (Client) Usage

#### Basic AI Chat API Call
```javascript
async function callAIPaid(prompt) {
  // 1. Initial request (will get HTTP 402)
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: 'gpt-4o-mini' })
  });

  if (response.status === 402) {
    // 2. Parse payment challenge
    const challenge = await response.json();
    console.log('Max budget required:', challenge.maxBudget);

    // 3. Create Nexus intent
    const nexus = new NexusSDK({
      apiKey: process.env.NEXUS_API_KEY,
      walletProvider: window.ethereum
    });

    const intentTx = await nexus.intent.create({
      intentId: challenge.intentId,
      payerAddress: userWallet.address,
      token: challenge.token,
      amount: ethers.parseUnits(challenge.maxBudget, 6), // USDC 6 decimals
      expiry: challenge.expiresAt
    });

    // 4. Retry with payment evidence
    const paidResponse = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Payment-Evidence': JSON.stringify({
          intentId: challenge.intentId,
          nexusTx: intentTx.transactionHash
        })
      },
      body: JSON.stringify({ prompt, model: 'gpt-4o-mini' })
    });

    const result = await paidResponse.json();
    console.log('AI Response:', result.result.completion);
    console.log('Cost: $', result.settlement.usedAmount);
    console.log('Refund: $', result.settlement.refundAmount);

    return result;
  }
}
```

#### Metamask Integration
```javascript
// Connect wallet first
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const userAddress = await signer.getAddress();

// Then use in payment flow
const intentTx = await nexus.intent.create({
  intentId: challenge.intentId,
  payerAddress: userAddress, // From connected wallet
  token: "USDC",
  amount: ethers.parseUnits("0.05", 6),
  expiry: Math.floor(Date.now() / 1000) + 300
});
```

### Provider (Server) Implementation

#### Provider Service Setup
```javascript
const express = require('express');
const { NexusAdapter } = require('fluxpay-gateway');

const app = express();
const nexus = new NexusAdapter({
  contracts: {
    audit: process.env.AUDIT_CONTRACT,
    registry: process.env.REGISTRY_CONTRACT
  }
});

// Initialize and register provider
await nexus.initialize();
await registerProvider(nexus, {
  address: providerWallet.address,
  endpoints: ['/api/ai/chat'],
  pricing: { basePrice: 0.0005e6, pricePerToken: 0.00006e6 }
});
```

#### Handling Paid Requests
```javascript
app.post('/api/ai/chat', async (req, res) => {
  try {
    // Gateway has already validated payment
    const { prompt, model } = req.body;
    const intentId = req.headers['x-fluxpay-intent'];

    // Call OpenRouter for AI processing
    const openRouter = new OpenRouterProxy({
      apiKey: process.env.OPENROUTER_KEY
    });

    const aiResponse = await openRouter.callCompletion({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });

    // Calculate actual cost
    const cost = calculateCost(aiResponse.usage, model);
    const receipt = {
      intentId,
      usedAmount: cost,
      tokensUsed: aiResponse.usage.total_tokens,
      provider: providerWallet.address,
      nonce: generateUniqueNonce(),
      timestamp: Math.floor(Date.now() / 1000),
      signature: signReceipt(receiptData, providerKey)
    };

    // Return receipt as part of response
    res.json({
      completion: aiResponse.choices[0].message.content,
      receipt: receipt
    });

  } catch (error) {
    // On error, gateway handles refund automatically
    res.status(500).json({ error: 'Service failed, refund initiated' });
  }
});

function calculateCost(usage, model) {
  const pricing = {
    'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 }, // per 1K tokens
    'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 }
  };

  const modelPricing = pricing[model];
  const tokens = usage.total_tokens;

  return Math.ceil(tokens / 1000) * (modelPricing.prompt + modelPricing.completion);
}

function signReceipt(receipt, privateKey) {
  // Deterministic signing process
  const sortedData = Object.keys(receipt).sort().reduce((obj, key) => {
    obj[key] = receipt[key];
    return obj;
  }, {});

  const message = JSON.stringify(sortedData);
  return crypto.createSign('SHA256').update(message).sign(privateKey, 'hex');
}
```

## Nexus Advanced Features

### Cross-Chain Balance Queries
```javascript
// Check unified balance across all chains
const balance = await nexus.balance.unified({
  address: userWallet.address,
  token: "USDC"
});

console.log('Total USDC across chains:', balance.totalAmount / 1e6); // 100.0
console.log('Breakdown:', balance.breakdown);
// { ethereum: 50000000, polygon: 25000000, arbitrum: 15000000, ... }
```

### Optimal Route Calculation
```javascript
// Find best path for cross-chain transfer
const quote = await nexus.swap.getQuote({
  fromChain: "ethereum",
  toChain: "arbitrum",
  fromToken: "USDC",
  toToken: "USDC",
  amount: "50000000" // 50 USDC
});

console.log('Route:', quote.route);        // 'bridge'
console.log('Cost:', quote.gasEstimate);   // 200000
console.log('Time:', quote.timeEstimate);  // 180 (seconds)
```

### Intent Status Monitoring
```javascript
// Track payment through states
const status = await nexus.intent.status(intentId);

console.log('Status:', status.state);     // 'LOCKED' | 'SETTLED' | 'REFUNDED'
console.log('Amount:', status.lockedAmount / 1e6);
console.log('Expiry:', new Date(status.expiry * 1000));

// States:
// - LOCKED: Funds committed, service not delivered
// - SETTLED: Service delivered, payment transferred
// - REFUNDED: Service failed, funds returned
// - EXPIRED: Timeout, being refunded
```

## Automatic Refund Scenarios

### 1. Timeout (SLA) Refunds
- **Trigger**: Service doesn't complete within SLA period (default 30s)
- **Action**: Gateway automatically calls `nexus.refundIntent()`
- **Guarantee**: 100% refund, no fees deducted
- **Audit**: Recorded on-chain as `IntentRefunded`

### 2. Service Failure Refunds
- **Trigger**: Provider error, OpenRouter timeout, crash
- **Action**: Exception handlers immediately refund
- **Result**: Client receives 502 + "Funds automatically refunded"
- **Time**: Typically <5 seconds

### 3. Overpayment Refunds
- **Trigger**: Usage costs less than locked amount
- **Action**: Nexus settlement automatically refunds remainder
- **Example**: Lock 0.05 USDC, use 0.007 USDC → refund 0.043 USDC
- **No Fee**: Full remainder returned instantly

## Security Model

### Trust-Minimized Design
**What users DO trust:**
- Blockchain consensus (Ethereum/Arbitrum security)
- Nexus escrow (funds never held by gateway)
- OpenRouter metering (for AI usage verification)

**What users DON'T need to trust:**
- Gateway operators (funds controlled by Nexus)
- Providers (usage verified against third-party)
- Cross-chain bridges (only audited protocols used)

### Cryptographic Security
- **Receipt Signing**: ECDSA signatures bind providers to usage claims
- **Nonce Protection**: Prevents replay attacks
- **Merkle Anchoring**: Receipts batched and anchored to Avail DA
- **On-Chain Audit**: All operations recorded immutably

## Integration Examples

### Autonomous AI Agents
```javascript
class AutonomousAgent {
  constructor(nexusConfig) {
    this.nexus = new NexusSDK(nexusConfig);
    this.agentWallet = ethers.Wallet.createRandom();
  }

  async processWithAI(task) {
    // Agent can pay for unlimited AI calls without manual intervention
    const response = await this.callPaidAPI('/api/ai/chat', {
      prompt: task.description,
      model: 'claude-3-haiku' // Cost-optimized choice
    });

    // Agent processes response and continues
    return this.analyzeResponse(response.completion);
  }

  async callPaidAPI(endpoint, data) {
    // Automatic x402 handling built into agent's request wrapper
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Authorization': this.getAgentSignature()
      },
      body: JSON.stringify(data)
    });

    if (response.status === 402) {
      const challenge = await response.json();

      // Agent automatically pays using Nexus
      await this.payForRequest(challenge);
      return this.callPaidAPI(endpoint, data); // Retry
    }

    return response.json();
  }

  async payForRequest(challenge) {
    // Agent maintains budget in unified balance
    return this.nexus.intent.create({
      intentId: challenge.intentId,
      payerAddress: this.agentWallet.address,
      token: "USDC",
      amount: ethers.parseUnits(challenge.maxBudget, 6),
      expiry: challenge.expiresAt
    });
  }
}
```

### API Marketplace
```javascript
// Gateway hosts multiple providers
const marketplace = {
  'openai-gpt4': {
    provider: '0x123...',
    endpoint: '/api/providers/openai/v1/chat/completions',
    pricing: { base: 0.001e6, perToken: 0.0006e6 }
  },
  'anthropic-claude': {
    provider: '0x456...',
    endpoint: '/api/providers/anthropic/v1/messages',
    pricing: { base: 0.001e6, perToken: 0.0008e6 }
  }
};

// Client can call any provider seamlessly
async function callBestProvider(model, prompt) {
  const providerConfig = marketplace[model.replace('gpt-4', 'openai-gpt4')];

  const response = await fetch(providerConfig.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });

  if (response.status === 402) {
    // x402 flow works regardless of provider
    const challenge = await response.json();
    await handlePayment(challenge);
    return callBestProvider(model, prompt); // Retry
  }

  return response.json();
}
```

## Performance & Scaling

### Latency Optimizations
- **Parallel Validation**: Intent checks run concurrently with provider calls
- **Cached Routing**: Nexus maintains optimal path caches
- **Streaming Support**: Payments work with streaming AI responses
- **Batch Anchoring**: Receipts batched every 10 minutes to Avail DA

### Scaling Considerations
- **Gateway Clusters**: Stateless horizontal scaling
- **Nonce Sharding**: Distributed nonce tracking with Redis
- **Settlement Queues**: Async cross-chain operations with monitoring
- **Provider Load Balancing**: Automatic failover between provider instances

### Cross-Chain Performance Matrix

| Scenario | Method | Typical Time | Cost (Gas) |
|----------|--------|--------------|------------|
| Same Chain | Direct Transfer | <15 seconds | $0.01 |
| L2 ↔ L2 | Bridge | 1-3 minutes | $0.50-2.00 |
| L1 ↔ L2 | Bridge + Verify | 1-5 minutes | $1-5 |
| Multi-hop | Multiple Bridges | 5-15 minutes | $5-20 |

## Troubleshooting

### Common Issues

#### Payment Timeout
```javascript
// Symptom: "Intent expired before settlement"
// Solution: Increase expiry time or check provider SLA
const intent = await nexus.intent.create({
  ...params,
  expiry: 10 * 60 * 1000  // 10 minutes for slow services
});
```

#### Insufficient Balance
```javascript
// Symptom: "Unified balance too low"
// Check balance across chains
const balance = await nexus.balance.unified({
  address: userWallet.address,
  token: "USDC"
});
console.log('Available:', balance.totalAmount / 1e6);
```

#### Chain Congestion
```javascript
// Symptom: Cross-chain settlement slow
// Monitor status and consider same-chain providers
const status = await nexus.intent.status(intentId);
if (status.state === 'LOCKED') {
  console.log('Waiting for cross-chain operation...');
}
```

### Debug Endpoints
```javascript
// Check intent status
GET /api/debug/intent/:intentId
// Returns: { status, amount, expiry, payer, txHashes }

// Check provider registrations
GET /api/debug/providers
// Returns: [{ address, endpoints, pricing, isActive }]

// Check unified balance
GET /api/debug/balance/:address
// Returns: { totalAmount, breakdown: { chain: amount } }
```

## Best Practices

### For API Consumers
1. **Set Realistic Budgets**: Estimate usage based on input size + model costs
2. **Handle 402 Responses**: Always prepare for payment challenges
3. **Monitor Refunds**: Check settlement data for automatic refunds
4. **Use Unified Balances**: Leverage Nexus for simplified cross-chain payments

### For API Providers
1. **Accurate Metering**: Integrations with OpenRouter/third-parties
2. **Fast SLAs**: Set realistic timeouts to avoid unnecessary refunds
3. **Cryptographic Signing**: Sign receipts with properly managed keys
4. **Error Handling**: Graceful failures trigger automatic refunds

### For Gateway Operators
1. **Monitor SLA Compliance**: Automated refund processing is critical
2. **Batch Receipt Anchoring**: Regular Avail DA anchoring for verifiability
3. **Cross-Chain Monitoring**: Track bridge success rates and congestions
4. **Provider Verification**: Validate against registry before routing traffic

## Future Enhancements

### Multi-Token Support
```javascript
// Support tokens beyond USDC
await nexus.intent.create({
  intentId: "fluxpay:xyz789",
  token: "ETH",  // Ethereum native
  amount: ethers.parseEther("0.001"),
  expiry: expiry
});
```

### Streaming Payments
```javascript
// Pay per chunk in streaming responses
const stream = await fetch('/api/ai/stream', {
  headers: { 'Payment-Evidence': intentData }
});

for await (const chunk of stream) {
  // Gateway can settle partial amounts as stream progresses
  if (chunk.usageTokens % 100 === 0) {
    await nexus.settlePartial(intentId, chunk.costSoFar);
  }
}
```

### AI Model Negotiation
```javascript
// Gateway selects optimal model within budget
const response = await fetch('/api/ai/smart', {
  method: 'POST',
  body: JSON.stringify({
    task: "summarize document",
    maxBudget: 0.01,  // Gateway chooses best model
    prompt: documentText
  })
});
```

## Summary

x402 and Nexus together provide a **trust-minimized**, **real-time micropayments infrastructure** for the API economy. The HTTP 402 challenge-response flow enables true pay-per-use models, while Nexus unified balances eliminate cross-chain complexity.

Key benefits:
- **Zero Pre-Trust**: Users don't need to trust intermediaries
- **Automatic Refunds**: SLA and error-based refund mechanisms
- **Cross-Chain Native**: Works across 10+ blockchains seamlessly
- **AI-Optimized**: Token-level metering via OpenRouter integration
- **Verifiable**: All settlements anchored to blockchain for dispute resolution

This technology unlocks autonomous agents, API marketplaces, and real-time billing for previously impossible use cases in the AI and API economy.
