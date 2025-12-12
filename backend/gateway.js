/**
 * @file gateway.js
 * @description x402 Payment Gateway Server - Core HTTP Server implementing HTTP 402 challenge-response flow
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const { generateIntentId, validateSignature } = require('./receiptVerifier');
const { NexusAdapter } = require('./nexusAdapter');
const { OpenRouterProxy } = require('./openRouterProxy');
const axios = require('axios');

// Environment variables
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;
const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:4000';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GATEWAY_PRIVATE_KEY = process.env.GATEWAY_PRIVATE_KEY; // For signing gateway operations

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Support large requests

// Initialize adapters
const nexusAdapter = new NexusAdapter();
const openRouterProxy = new OpenRouterProxy(OPENROUTER_API_KEY);

// In-memory storage for MVP (use Redis/PostgreSQL in production)
const activeIntents = new Map(); // intentId => { status, expiry, lockedAmount, provider }
const processedReceipts = new Set(); // nonce tracking for replay protection

/**
 * Main request handler for all API endpoints
 * Implements x402 payment flow
 */
app.all('/api/*', async (req, res) => {
  try {
    const paymentEvidence = req.headers['payment-evidence'];

    if (!paymentEvidence) {
      // PHASE 1: Return HTTP 402 Payment Required
      const intentId = generateIntentId();

      // Estimate cost based on endpoint type
      const endpoint = req.path;
      const priceEstimate = estimatePrice(endpoint, req.body);

      const challenge = {
        challengeType: 'x402',
        intentId,
        maxBudget: formatUsdc(priceEstimate.max),
        token: 'USDC',
        expiresAt: Math.floor(Date.now() / 1000) + (5 * 60), // 5 min expiry
        payWith: 'fluxpay:nexus-createIntent',
        instructions: {
          sdk: 'nexus.createIntent',
          params: {
            intentId,
            payer: '<user_wallet>',
            token: 'USDC',
            amount: priceEstimate.max,
            expiry: Math.floor(Date.now() / 1000) + (5 * 60)
          }
        },
        retryWith: {
          header: 'Payment-Evidence',
          value: { intentId, nexusTx: '<transaction_hash>' }
        }
      };

      // Store intent locally for validation
      activeIntents.set(intentId, {
        status: 'PENDING',
        expiry: challenge.expiresAt,
        lockedAmount: priceEstimate.max,
        endpoint,
        payload: req.body,
        headers: req.headers,
        timestamp: Date.now()
      });

      return res.status(402).json(challenge);
    }

    // PHASE 2: Validate Payment Evidence & Process Request
    const evidence = JSON.parse(paymentEvidence);
    const { intentId, nexusTx } = evidence;

    // Validate intent exists and not expired
    const intentRecord = activeIntents.get(intentId);
    if (!intentRecord) {
      return res.status(400).json({ error: 'Invalid intent ID' });
    }

    if (Date.now() / 1000 > intentRecord.expiry) {
      return res.status(400).json({ error: 'Intent expired' });
    }

    // Verify lock status via Nexus
    const intentStatus = await nexusAdapter.getIntentStatus(intentId);
    if (intentStatus.status !== 'LOCKED') {
      return res.status(402).json({ error: 'Funds not locked' });
    }

    if (intentStatus.amount < intentRecord.lockedAmount) {
      return res.status(402).json({ error: 'Insufficient locked amount' });
    }

    // Mark intent as processing
    intentRecord.status = 'PROCESSING';

    // Forward to provider with intent context
    const result = await processWithProvider(intentRecord.endpoint, intentRecord.payload, intentId);

    // Validate and settle
    const settlementResult = await handleSettlement(intentId, result, intentRecord);

    // Clean up intent
    activeIntents.delete(intentId);

    return res.json(settlementResult);

  } catch (error) {
    console.error('Gateway error:', error);

    // Attempt refund on errors
    try {
      if (req.headers['payment-evidence']) {
        const evidence = JSON.parse(req.headers['payment-evidence']);
        await nexusAdapter.refundIntent(evidence.intentId);
      }
    } catch (refundError) {
      console.error('Refund failed:', refundError);
    }

    return res.status(500).json({
      error: 'Service error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Process request with provider and get usage receipt
 */
async function processWithProvider(endpoint, payload, intentId) {
  const providerResponse = await axios.post(`${PROVIDER_URL}${endpoint}`, {
    payload,
    intentId
  }, {
    timeout: 30000, // 30s timeout
    headers: {
      'Content-Type': 'application/json'
    }
  });

  return providerResponse.data;
}

/**
 * Handle settlement after receiving provider result
 */
async function handleSettlement(intentId, result, intentRecord) {
  const { receipt, apiResult } = result;

  // Validate receipt
  const isValid = validateSignature(receipt);
  if (!isValid) {
    throw new Error('Invalid receipt signature');
  }

  // Check nonce for replay protection
  if (processedReceipts.has(receipt.nonce)) {
    throw new Error('Duplicate receipt nonce');
  }
  processedReceipts.add(receipt.nonce);

  // Verify used amount matches expected consumption
  const verifiedAmount = await verifyUsageAmount(receipt, apiResult, intentRecord);

  // Settle via Nexus
  const settleTx = await nexusAdapter.settleIntent({
    intentId,
    recipient: receipt.provider,
    amount: verifiedAmount,
    targetChain: receipt.payoutChain || 'ethereum',
    targetToken: 'USDC'
  });

  // Record on audit contract (pseudo - integration needed)
  await recordToAuditContract(intentId, verifiedAmount, settleTx);

  return {
    result: apiResult,
    settlement: {
      intentId,
      usedAmount: formatUsdc(verifiedAmount),
      settledTx: settleTx,
      refundAmount: formatUsdc(intentRecord.lockedAmount - verifiedAmount)
    }
  };
}

/**
 * Verify usage amount matches provider's claim
 */
async function verifyUsageAmount(receipt, apiResult, intentRecord) {
  let verifiedAmount;

  if (intentRecord.endpoint.startsWith('/ai/')) {
    // For AI endpoints, verify against OpenRouter usage
    verifiedAmount = await openRouterProxy.verifyUsage(apiResult, receipt);
  } else {
    // For other endpoints, trust provider (or add custom verification)
    verifiedAmount = receipt.usedAmount;
  }

  if (verifiedAmount > intentRecord.lockedAmount) {
    throw new Error('Claimed usage exceeds locked amount');
  }

  return verifiedAmount;
}

/**
 * Estimate price for different endpoints
 */
function estimatePrice(endpoint, payload) {
  if (endpoint.startsWith('/ai/chat')) {
    return {
      min: 0.001, // 1k satoshi-ish USDC
      max: 0.05   // Max $0.05 for long chats
    };
  }

  if (endpoint.startsWith('/api/')) {
    return {
      min: 0.0001,
      max: 0.01
    };
  }

  return { min: 0.001, max: 0.05 }; // Default
}

/**
 * Format amount in USDC (from wei equivalent)
 */
function formatUsdc(amount) {
  return (amount / 1e6).toFixed(6); // USDC has 6 decimals
}

/**
 * Pseudo-onchain audit recording
 */
async function recordToAuditContract(intentId, amount, txHash) {
  // In production: call smart contract
  console.log(`Recording settlement: ${intentId} -> ${amount} via ${txHash}`);
}

/**
 * SLA monitoring and timeout refunds (run periodically)
 */
async function checkTimeouts() {
  const now = Date.now() / 1000;
  for (const [intentId, intent] of activeIntents.entries()) {
    if (intent.status === 'PROCESSING' && now > intent.expiry) {
      console.log(`Timeout refund for intent ${intentId}`);
      await nexusAdapter.refundIntent(intentId);
      activeIntents.delete(intentId);

      // Record refund on contract
      await recordRefundToAuditContract(intentId);
    }
  }
}

// User data endpoints for dashboard (demo/mock data)
app.get('/api/user/:address/intents', (req, res) => {
  const userAddress = req.params.address.toLowerCase();

  // Mock active intents for demo
  const mockIntents = [
    {
      intentId: 'intent-demo-001',
      status: 'LOCKED',
      lockedAmount: 1000000, // 1 USDC in wei-equivalent
      expiry: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
      payer: userAddress
    },
    {
      intentId: 'intent-demo-002',
      status: 'SETTLED',
      lockedAmount: 50000,
      expiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 1 day from now
      payer: userAddress
    }
  ];

  res.json(mockIntents);
});

app.get('/api/user/:address/receipts', (req, res) => {
  const userAddress = req.params.address.toLowerCase();

  // Mock receipts for demo
  const mockReceipts = [
    {
      intentId: 'intent-demo-001',
      usedAmount: 50000, // 0.05 USDC
      tokensUsed: 150,
      provider: '0x742d35Cc7c6d21012B5991BcEFf26b5115Cf4C9f',
      timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      model: 'openai/gpt-4o-mini',
      completion: 'The user asked about integrating AI payments...'
    },
    {
      intentId: 'intent-demo-002',
      usedAmount: 80000, // 0.08 USDC
      tokensUsed: 200,
      provider: '0x742d35Cc7c6d21012B5991BcEFf26b5115Cf4C9f',
      timestamp: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
      model: 'openai/gpt-4o',
      completion: 'Here is the comprehensive guide for FluxPay integration...'
    }
  ];

  res.json(mockReceipts);
});

app.get('/api/user/:address/refunds', (req, res) => {
  const userAddress = req.params.address.toLowerCase();

  // Mock refunds for demo
  const mockRefunds = [
    {
      intentId: 'intent-demo-timeout-001',
      amount: 25000, // 0.025 USDC
      reason: 'Service timeout',
      nexusTx: '0x123456789abcdef123456789abcdef123456789abcdef',
      timestamp: Math.floor(Date.now() / 1000) - (2 * 60 * 60) // 2 hours ago
    }
  ];

  res.json(mockRefunds);
});

// Demo endpoint for creating intents (what the frontend calls)
app.post('/api/user/:address/create-intent', async (req, res) => {
  const userAddress = req.params.address;
  const { intentId, amount } = req.body;

  try {
    // In demo mode, just store locally and return success
    const intentRecord = {
      intentId,
      status: 'LOCKED',
      lockedAmount: amount,
      expiry: Math.floor(Date.now() / 1000) + (5 * 60), // 5 minutes
      payer: userAddress,
      timestamp: Date.now()
    };

    activeIntents.set(intentId, intentRecord);

    res.json({
      success: true,
      transactionHash: 'mock_tx_' + Math.random().toString(36).substr(2, 9),
      intent: intentRecord
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Demo AI endpoint that requires payment
app.post('/api/ai/chat', async (req, res) => {
  const paymentEvidence = req.headers['payment-evidence'];

  if (!paymentEvidence) {
    // Return HTTP 402 challenge
    const intentId = generateIntentId();
    const challenge = {
      challengeType: 'x402',
      intentId,
      maxBudget: '0.050000',
      token: 'USDC',
      expiresAt: Math.floor(Date.now() / 1000) + (5 * 60),
      payWith: 'nexus.createIntent',
      instructions: {
        intentId,
        payer: '<user_wallet>',
        token: 'USDC',
        amount: 50000, // 0.05 USDC in wei-equivalent
        expiry: Math.floor(Date.now() / 1000) + (5 * 60)
      },
      retryWith: {
        header: 'Payment-Evidence',
        value: { intentId, nexusTx: '<transaction_hash>' }
      }
    };

    activeIntents.set(intentId, {
      status: 'PENDING',
      expiry: challenge.expiresAt,
      lockedAmount: 50000,
      endpoint: '/api/ai/chat',
      payload: req.body,
      headers: req.headers,
      timestamp: Date.now()
    });

    return res.status(402).json(challenge);
  }

  try {
    // Process payment and generate AI response
    const evidence = JSON.parse(paymentEvidence);
    const { intentId } = evidence;

    // Verify intent
    const intentRecord = activeIntents.get(intentId);
    if (!intentRecord || intentRecord.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid intent' });
    }

    // In demo mode, we'll simulate AI call and create a mock receipt
    const mockReceipt = {
      intentId,
      usedAmount: 7500, // 0.0075 USDC (~150 tokens at GPT-4o-mini rates)
      tokensUsed: 150,
      provider: '0x742d35Cc7c6d21012B5991BcEFf26b5115Cf4C9f',
      nonce: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      model: 'openai/gpt-4o-mini',
      receiptHash: crypto.createHash('sha256').update(`${intentId}:${150}`).digest('hex')
    };

    // Sign receipt (in real implementation, this would be done by provider)
    const sign = crypto.createSign('SHA256');
    sign.update(`${mockReceipt.intentId}:${mockReceipt.usedAmount}:${mockReceipt.nonce}`);
    mockReceipt.signature = sign.sign(GATEWAY_PRIVATE_KEY || 'demo_key', 'hex');

    // Mock AI response
    const mockResponse = {
      completion: `Thank you for using FluxPay AI! Here's a comprehensive response to your question about ${req.body.prompt || 'AI integration'}:

## Key Benefits of FluxPay x402

1. **Trust-minimized payments** - No custody of funds
2. **Microtransactions** - Pay exactly for what you use (down to token-level precision)
3. **Cross-chain settlement** - Unified balances across multiple blockchains
4. **Automatic refunds** - SLA-based guarantees with instant timeouts

## Getting Started

To integrate FluxPay into your dApp:

\`\`\`javascript
// 1. Create intent
const intent = await nexusSDK.intent.create({
  intentId: '${intentId}',
  payerAddress: userWallet,
  token: 'USDC',
  amount: 50000, // 0.05 USDC
  expiry: Date.now() + 300000
});

// 2. Use in API calls
fetch('/api/ai/chat', {
  headers: {
    'Payment-Evidence': JSON.stringify({
      intentId: '${intentId}',
      nexusTx: intent.transactionHash
    })
  },
  body: JSON.stringify({ prompt: "Your question here" })
});
\`\`\`

This used approximately 150 tokens at GPT-4o-mini pricing. Your remaining balance has been refunded automatically.`,
      usage: {
        prompt_tokens: 45,
        completion_tokens: 150,
        total_tokens: 195
      },
      model: 'openai/gpt-4o-mini'
    };

    // "Settle" the intent
    const result = {
      receipt: mockReceipt,
      apiResult: mockResponse
    };

    const settlementData = await handleSettlement(intentId, result, intentRecord);

    // Clean up
    activeIntents.delete(intentId);

    res.json(settlementData);

  } catch (error) {
    console.error('Demo AI endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run timeout checker every 30 seconds
setInterval(checkTimeouts, 30000);

app.listen(PORT, () => {
  console.log(`FluxPay Gateway listening on port ${PORT}`);
  console.log(`Provider URL: ${PROVIDER_URL}`);
  console.log(`Demo mode: Enabled - Mock endpoints available`);
});

module.exports = app;
