# FluxPay Nexus Architecture

## High-Level System Overview

```
┌─────────────────┐    HTTP 402    ┌─────────────────┐    Nexus SDK    ┌─────────────────┐
│                 │ ────────────►  │                 │ ──────────────► │                 │
│   AI Agent /    │                │   x402 Gateway  │                 │   Avail Nexus   │
│   Human User    │ ◄────────────► │                 │ ◄─────────────► │   Unified       │
│                 │    Response    │                 │    Settlements  │   Balances      │
└─────────────────┘                └─────────────────┘                 └─────────────────┘
           │                               │                                      │
           │                               │                                      │
           ▼                               ▼                                      ▼
┌─────────────────┐               ┌─────────────────┐                  ┌─────────────────┐
│                 │               │                 │                  │                 │
│ Provider        │◄─────────────►│ OpenRouter      │◄───────────────► │ Avail DA        │
│ Service         │   API Call    │ AI Gateway      │   Model Output   │ Anchor Proofs   │
│ (Authorizes     │               │ (Routes to      │                  │                 │
│  Usage)         │               │  models)        │                  │                 │
└─────────────────┘               └─────────────────┘                  └─────────────────┘
```

## Core Components

### 1. x402 Payment Gateway (`gateway.js`)
**Responsibilities:**
- Receives HTTP requests for metered APIs
- Responds with HTTP 402 Payment Required challenges
- Validates Payment-Evidence headers with Nexus intent status
- Proxies requests to providers and handles settlement
- Manages timeout-based automatic refunds
- Anchors usage receipts to Avail DA

**Key Functions:**
- `app.all('/api/*')`: Main request handler implementing x402 flow
- `processWithProvider()`: Forwards request to provider service
- `handleSettlement()`: Validates receipts, settles via Nexus, anchors proofs
- `checkTimeouts()`: Cron job for SLA enforcement and refunds

**Security Controls:**
- Intent status verification before request processing
- Receipt signature validation using provider public keys
- Nonce replay protection with in-memory tracking
- SLA-based timeout monitoring with automatic refunds

### 2. Nexus Adapter (`nexusAdapter.js`)
**Responsibilities:**
- Wrapper for Avail Nexus SDK operations
- Unified balance management across chains
- Cross-chain intent creation and settlement
- Automatic refund handling
- Receipt anchoring to Avail DA
- On-chain audit contract interactions

**Key Functions:**
- `createIntent()`: Locks funds in unified balance
- `getIntentStatus()`: Query intent state (LOCKED/SETTLED/REFUNDED)
- `settleIntent()`: Route exact payment to provider with possible cross-chain swap
- `refundIntent()`: Return unused funds to user
- `anchorReceipts()`: Store verifiable proofs in Avail DA

**Integration Points:**
- Calls `FluxPayAudit.recordIntent()`, `recordSettlement()`, `recordRefund()`
- Checks provider registration via `ProviderRegistry.isProviderActive()`

### 3. OpenRouter Proxy (`openRouterProxy.js`)
**Responsibilities:**
- LLM model execution via OpenRouter API
- Token metering and cost calculation
- Usage verification against provider claims
- Optimal model selection based on cost constraints
- Rate limiting and batch processing

**Key Functions:**
- `callCompletion()`: Execute AI models via OpenRouter
- `verifyUsage()`: Cross-reference provider receipt against OpenRouter usage data
- `callWithCostOptimization()`: Select best model within budget
- `getModelPricing()`: Real-time pricing data from supported models

**Supported Models:**
- OpenAI GPT-4, GPT-4-mini, GPT-3.5-turbo
- Anthropic Claude 3.5 Sonnet, Claude 3 Haiku
- Meta Llama 3.1, Mistral models
- Dynamic pricing updates via OpenRouter API

### 4. Receipt Verifier (`receiptVerifier.js`)
**Responsibilities:**
- Cryptographic signature verification of usage receipts
- Nonce management for replay protection
- Merkle tree construction for batch anchoring
- Provider key validation
- Dispute evidence preparation

**Key Functions:**
- `validateReceipt()`: Complete receipt validation pipeline
- `validateSignature()`: ECDSA signature verification
- `validateNonce()`: Replay attack prevention
- `createReceiptsMerkleRoot()`: Merkle proofs for DA anchoring

**Security Features:**
- Deterministic JSON serialization for signing
- Timestamp validation (not too old/future)
- Provider key rotation support
- VerifiableReceipt class for dispute resolution

## Smart Contracts

### FluxPayAudit.sol
**Purpose:** Tamper-evident audit trail for all payment intents, settlements, and refunds.

**Key Features:**
- `recordIntent()`: Log intent creation after Nexus success
- `recordSettlement()`: Record successful payments to providers
- `recordRefund()`: Log refund operations
- `batchRecordSettlements()`: Gas-efficient batch recording

**Events Emitted:**
- `IntentLocked`: Funds committed to payment flow
- `IntentSettled`: Payment routed to provider
- `IntentRefunded`: Funds returned to user

### ProviderRegistry.sol
**Purpose:** Registration and management of API/AI providers with pricing models.

**Key Features:**
- `registerProvider()`: Onboard new service providers
- `setPricingRule()`: Configure endpoint pricing (base + per-token/per-KB)
- `isProviderActive()`: Runtime provider validation
- `getPricing()`: Lookup pricing for settlement calculations

**Security Model:**
- Provider signatures on usage receipts
- Authorized gateway role for updates
- SLA timeout enforcement per provider

## Data Flow - Complete Payment Cycle

### Phase 1: Payment Challenge (HTTP 402)
```
Client Request → Gateway
    ↓
Price Estimation → Intent ID Generation
    ↓
HTTP 402 Response + Challenge Payload
```

### Phase 2: Payment Execution (Nexus Intent)
```
Challenge Response → Nexus.createIntent()
    ↓
Funds Locked → Unified Balance
    ↓
Payment-Evidence → Gateway Retry
```

### Phase 3: API Execution & Settlement
```
Evidence Validation → Provider Proxy
    ↓
OpenRouter Call → Usage Metering
    ↓
Receipt Signature → Gateway Validation
```

### Phase 4: Cross-Chain Settlement
```
Receipt Verified → Nexus.settle()
    ↓
Cross-Chain Routing → Provider Payout
    ↓
Remainder Refund → User Balance
```

### Phase 5: Receipt Anchoring
```
Receipt Batch → Merkle Root
    ↓
Avail DA Anchor → Verifiable Proofs
```

## Security Architecture

### Threat Mitigation
- **Double-spend**: Nonce replay protection + intent state validation
- **Provider fraud**: Receipt signature verification + usage cross-checking
- **Timeout attacks**: SLA-based automatic refunds
- **Chain congestion**: Unified balances + multi-chain routing
- **Evidence tampering**: Merkle proofs anchored to Avail DA

### Trust Minimization
- Funds never held by gateway (Nexus escrow)
- Provider claims verified against third-party (OpenRouter)
- All settlement actions logged immutably on-chain
- Dispute resolution via anchored cryptographic proofs

## Performance Considerations

### Scaling Vectors
- Horizontal gateway scaling (stateless requests)
- Receipt batching for DA anchoring (Merkle trees)
- In-memory nonce caching with Redis fallback
- Async settlement processing via message queues

### Latency Optimization
- Parallel validation (intent status + receipt signature)
- Cached provider registry lookups
- Streaming AI responses where supported
- DNS caching for provider endpoints

## Deployment Architecture

### Production Topology
```
┌─────────────────┐
│   Load Balancer │
│   (CloudFlare)  │
└─────────────────┘
         │
    ┌────▼────┐
    │ Gateway │
    │ Cluster │
    └─────────┘
         │
    ┌────▼────┐
    │ Provider│
    │ Services│
    └─────────┘
```

### Infrastructure Requirements
- **Gateway**: Node.js cluster, Redis for sessions, PostgreSQL for receipts
- **Nexus Integration**: Dedicated SDK instances with connection pooling
- **Monitoring**: Prometheus metrics, ELK stack for logs, Sentry for errors
- **Security**: Rate limiting, IP whitelisting, encrypted configurations

## API Endpoints

### Gateway API
- `GET/POST /api/*` - x402 payment flow for any metered endpoint
- `GET /health` - Service health status

### Provider API
- `POST /api/provider/register` - Provider onboarding
- `POST /api/provider/api/add` - API registration
- `GET /api/provider/:address/*` - Provider dashboard data

### User API
- `GET /api/user/:address/*` - User dashboard data

## Future Extensions

### Multi-Token Support
- Extend Nexus integration for non-USDC assets
- Dynamic pricing based on token volatility
- Cross-token settlement routing

### Advanced AI Features
- Streaming payment flows for long conversations
- Usage prediction models for intent sizing
- Provider marketplace with reputation scoring

### Enterprise Features
- Bulk processing APIs for high-volume users
- Custom SLA agreements
- Advanced analytics and reporting
