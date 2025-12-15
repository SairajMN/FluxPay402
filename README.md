# Fluxpay x402

**Real-Time AI & API Micropayments using HTTP 402, Avail Nexus, and OpenRouter**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)

## 🚀 What is Fluxpay x402?

Fluxpay x402 enables trust-minimized, real-time micropayments for AI and API services using the HTTP 402 Payment Required protocol. Built on Avail Nexus unified balances with OpenRouter AI metering, it provides automatic cross-chain settlement and SLA-based refunds.

### Key Features
- ✅ **HTTP 402 Protocol**: Payment challenge-response flow for any API
- ✅ **Cross-Chain Payments**: Automatic routing via Avail Nexus unified balances
- ✅ **AI Metering**: Token-level cost calculation using OpenRouter
- ✅ **Automatic Refunds**: SLA-based refunds when service fails
- ✅ **Receipt Anchoring**: Verifiable proofs anchored to Avail DA
- ✅ **Trust Minimization**: No custody of funds, third-party verification

## 📊 Architecture Overview

```
┌─────────────┐    HTTP 402    ┌───────────────┐    Nexus SDK    ┌─────────────┐
│ AI Agent /  │ ────────────►  │  x402 Gateway │ ─────────────►  │ Avail Nexus │
│ Human User  │ ◄────────────► │               │ ◄────────────►  │ Unified     │
└─────────────┘  + Receipt     └───────────────┘   Settlement    │ Balances    │
       │                            │                            │ Cross-Chain │
       ▼                            ▼                            └─────────────┘
┌─────────────┐            ┌──────────────┐                  ┌─────────────┐
│  Provider   │◄──────────►│  OpenRouter  │◄───────────────► │ Avail DA    │
│  Service    │  Signed    │ AI Gateway   │   Model Output   │ Anchor      │
│             │  Receipt   │              │                  │ Proofs      │
└─────────────┘            └──────────────┘                  └─────────────┘
```

## 🔧 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- MetaMask or Web3 wallet
- Avail Nexus testnet access

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/SairajMN/FluxPay402.git
cd FluxPay402
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Deploy smart contracts (testnet)**
```bash
cd contracts
npx hardhat run scripts/deploy.js --network arbitrumGoerli
# Or deploy on Base Sepolia:
npx hardhat run scripts/deploy.js --network base-sepolia
```

5. **Start the services**
```bash
# Backend
npm run start:gateway

# Frontend (separate terminal)
npm run start:frontend
```

### Demo Usage

```javascript
// 1. Call an AI API (no authentication needed)
fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: "Hello AI!" })
})
// → HTTP 402 Payment Required

// 2. Pay via Nexus SDK
import { NexusSDK } from '@avail-project/nexus/core';

const nexus = new NexusSDK({ /* config */ });
await nexus.intent.create({
  intentId: "fluxpay:demo123",
  payerAddress: userWallet,
  token: "USDC",
  amount: 0.05e6, // 0.05 USDC
  expiry: Date.now() + 300000
});

// 3. Retry the API call with payment evidence
fetch('/api/ai/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Payment-Evidence': JSON.stringify({
      intentId: "fluxpay:demo123",
      nexusTx: "0x..."
    })
  },
  body: JSON.stringify({ prompt: "Hello AI!" })
})
// → { result: { completion: "..." }, settlement: { ... } }
```

## 📁 Project Structure

```
FluxPay402/
├── contracts/              # Solidity smart contracts
│   ├── FluxPayAudit.sol    # Settlement audit trail
│   └── ProviderRegistry.sol # Provider management
├── backend/                # Core backend services
│   ├── gateway.js          # x402 HTTP server (main entry point)
│   ├── nexusAdapter.js     # Avail Nexus integration
│   ├── openRouterProxy.js  # OpenRouter AI metering
│   └── receiptVerifier.js  # Cryptographic validation
├── api/                    # API endpoints
│   ├── ai/
│   │   └── chat.js         # AI chat endpoint with x402 payment
│   ├── gateway.js          # API gateway handler
│   ├── test-payment.js     # Payment testing utilities
│   └── user/[address]/
│       └── balance.js      # User balance queries
├── frontend/               # React web application
│   ├── public/             # Static assets
│   ├── src/
│   │   ├── dashboard.jsx   # User/provider dashboard
│   │   ├── index.js        # Main React entry point
│   │   ├── wallet.js       # Wallet utilities
│   │   └── WalletConnect.jsx # Web3 wallet integration
│   └── package.json        # Frontend dependencies
├── docs/                   # Documentation
│   ├── architecture.md     # System architecture
│   ├── money-flow.md       # Payment flow details
│   ├── security.md         # Security & trust minimization
│   └── x402-nexus-guide.md # x402 & Nexus integration guide
├── scripts/                # Deployment and utility scripts
│   └── deploy.js           # Smart contract deployment
├── test/                   # Smart contract tests
│   ├── FluxPayAudit.test.js
│   ├── NexusAdapter.test.js
│   └── ProviderRegistry.test.js
└── package.json            # Root dependencies and scripts
```

## 🛠️ Development Roadmap

### Day 1: Core Infrastructure
- [x] Avail Nexus SDK integration
- [x] Smart contract deployment
- [x] x402 gateway skeleton
- [x] Basic intent creation

### Day 2: Payment Flow Implementation
- [x] Full x402 challenge-response cycle
- [x] Provider proxy system
- [ ] Receipt signing & validation
- [ ] Basic settlement logic

### Day 3: Advanced Features
- [ ] OpenRouter AI metering integration
- [ ] Cross-chain settlement
- [ ] Automatic refund system
- [ ] Receipt anchoring to Avail DA

### Day 4: UX & Testing
- [ ] User dashboard (wallet connection, intents, receipts)
- [ ] Provider dashboard (registration, APIs, revenue)
- [ ] End-to-end testing
- [ ] Documentation & pitch deck

## 🎯 Demo Scenario (Must Work)

1. **User calls `/api/ai/chat`** → Receives HTTP 402 challenge
2. **Pays with Nexus** → Locks 0.05 USDC from unified balance
3. **Gateway forwards** → Provider calls OpenRouter GPT-4o-mini
4. **AI responds** → 150 tokens used, costs 0.007 USDC
5. **Provider signs receipt** → Gateway validates signature
6. **Cross-chain settlement** → Provider paid on Arbitrum
7. **Automatic refund** → 0.043 USDC returned to user
8. **Receipts anchored** → Proof stored on Avail DA

## 🔒 Security Model

### Trust Assumptions (Minimally Required)
- **Blockchain Consensus**: Ethereum/Arbitrum security
- **Avail DA**: Data availability guarantees
- **Nexus Escrow**: Unified balance integrity
- **OpenRouter Honesty**: Usage metering accuracy

### Trust Assumptions (Eliminated)
- **Gateway Operators**: Funds never held custody
- **Provider Claims**: Verified against third-party usage
- **Cross-Chain Bridges**: Only audited protocols used
- **Settlement Process**: Fully automated, no admin intervention

### Automatic Refund Mechanisms
- **Timeout Refunds**: SLA violations trigger instant refunds
- **Failure Refunds**: Service errors guarantee 100% refunds
- **Overpayment Refunds**: Exact usage settled, remainder returned

## 🔄 Development Workflow

### Local Development
1. **Start development environment**
```bash
# Terminal 1: Backend (with auto-reload)
npm run dev

# Terminal 2: Frontend (with hot reload)
npm run start:frontend
```

2. **Deploy contracts for testing**
```bash
npx hardhat run scripts/deploy.js --network localhost
```

3. **Test contract changes**
```bash
npm test
```

### Contract Development
- Edit `.sol` files in `contracts/` directory
- Deploy with `npx hardhat run scripts/deploy.js --network <NETWORK>`
- Test with `npm test`

### Backend/Frontend Development
- Backend: Edit files in `backend/` and `api/`
- Frontend: Edit files in `frontend/src/`
- Changes auto-reload with `npm run dev` / `npm run start:frontend`

### Deployment
- **Contracts**: Use `scripts/deploy.js` with appropriate network
- **Full app**: Deploy to Vercel/Netlify via GitHub integration
- **Contracts**: Update `.env` with new contract addresses after deployment

## 📈 Business Model

### Revenue Streams
- **0.1% per-transaction fee** on all settlements
- **Monthly minimum fees** for high-volume providers
- **Enterprise features** (priority routing, custom SLAs)
- **Provider marketplace** commissions

### Market Opportunity
- **Total Addressable Market**: $100B+ API economy
- **AI-Specific Market**: $1.5B real-time billing opportunity
- **Beachhead Market**: $100M autonomous agents (2025)

### Competitive Advantages
- **First HTTP 402 implementation** with production settlement
- **True cross-chain payments** without user complexity
- **AI-native metering** with automatic refunds
- **Receipt verifiability** via blockchain anchoring


### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

### Testing
```bash
# Run smart contract tests (Hardhat)
npm test

# Run frontend tests (React)
npm run start:frontend && cd frontend && npm test

# Manual testing with local deployment
npm run deploy:contracts  # Deploy to localhost network
npm run dev              # Start backend
# Use frontend or API clients to test
```

## 📞 Contact & Resources

- **Website**: [Fluxpay] (https://fluxpay402.vercel.app/)
- **Documentation**: See `docs/` directory
- **Team**: [@sairaj](https://github.com/SairajMN) - Lead Developer

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Coinbase**: For pioneering work on x402 implementations
- **Ethereum Foundation**: For the HTTP 402 protocol specification
- **Avail Project**: For Nexus unified balances and DA anchoring
- **OpenRouter**: For AI model access and metering APIs



---

**Built for the AI economy. Trust-minimized payments for every API call.**
