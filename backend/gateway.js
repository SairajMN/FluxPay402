const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { NexusAdapter } = require('./nexusAdapter.js');
const { ReceiptVerifier } = require('./receiptVerifier.js');
const { OpenRouterProxy } = require('./openRouterProxy.js');

// Environment variables
const PORT = process.env.PORT || 3001;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GATEWAY_PRIVATE_KEY = process.env.GATEWAY_PRIVATE_KEY;

const app = express();
app.use(express.json());

// Initialize services
const nexusAdapter = new NexusAdapter();
const receiptVerifier = require('./receiptVerifier.js');
const openRouter = new OpenRouterProxy({ apiKey: OPENROUTER_API_KEY });

// Store active payments (in production, use Redis)
const activePayments = new Map();

// Middleware for CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Payment-Evidence, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize Nexus on startup
(async () => {
  try {
    await nexusAdapter.initialize();
    console.log('✅ Nexus adapter initialized');
  } catch (error) {
    console.error('⚠️ Nexus initialization failed:', error.message);
  }
})();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'FluxPay x402 Gateway',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Main x402 gateway endpoint
app.all('/api/*', async (req, res) => {
  const path = req.path;
  const method = req.method;

  try {
    // Check if request has payment evidence
    const paymentEvidence = req.headers['payment-evidence'];

    if (paymentEvidence) {
      // Process paid request
      await handlePaidRequest(req, res);
    } else {
      // Challenge for payment
      await handlePaymentChallenge(req, res);
    }
  } catch (error) {
    console.error('Gateway error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Handle payment challenge (HTTP 402)
async function handlePaymentChallenge(req, res) {
  const path = req.path;
  const intentId = `fluxpay:${crypto.randomUUID()}`;

  // Determine pricing based on endpoint
  let maxBudget, expiryTime;

  if (path.startsWith('/api/ai/')) {
    // AI endpoints: estimate based on expected usage
    maxBudget = '0.05'; // Max 0.05 USDC for AI calls
    expiryTime = 5 * 60; // 5 minutes
  } else {
    // Generic API endpoints
    maxBudget = '0.01'; // Max 0.01 USDC
    expiryTime = 2 * 60; // 2 minutes
  }

  const challenge = {
    challengeType: 'x402',
    intentId,
    maxBudget,
    token: 'USDC',
    expiresAt: Math.floor(Date.now() / 1000) + expiryTime,
    instructions: {
      sdk: 'avail-nexus',
      method: 'intent.create',
      params: {
        intentId,
        token: 'USDC',
        amount: maxBudget,
        expiry: Math.floor(Date.now() / 1000) + expiryTime
      }
    }
  };

  // Store challenge for verification
  activePayments.set(intentId, {
    challenge,
    status: 'CHALLENGED',
    createdAt: Date.now(),
    expiresAt: challenge.expiresAt * 1000
  });

  res.status(402).json(challenge);
}

// Handle paid request with evidence
async function handlePaidRequest(req, res) {
  try {
    const path = req.path;
    const method = req.method;
    const paymentEvidence = JSON.parse(req.headers['payment-evidence'] || '{}');
    const { intentId, nexusTx } = paymentEvidence;

    if (!intentId || !nexusTx) {
      return res.status(400).json({
        error: 'Invalid payment evidence',
        required: ['intentId', 'nexusTx']
      });
    }

    // Verify intent status with Nexus
    const intentStatus = await nexusAdapter.getIntentStatus(intentId);
    if (intentStatus.status !== 'LOCKED') {
      return res.status(402).json({
        error: 'Intent not locked or invalid',
        intentId,
        status: intentStatus.status
      });
    }

    // Update local payment status
    activePayments.set(intentId, {
      ...activePayments.get(intentId),
      status: 'PROCESSING',
      evidence: paymentEvidence,
      processedAt: Date.now()
    });

    // Route based on endpoint type
    if (path.startsWith('/api/ai/chat')) {
      await handleAIChat(req, res, intentId);
    } else if (path.startsWith('/api/provider/')) {
      await handleProviderProxy(req, res, intentId);
    } else {
      // Generic API proxy
      await handleGenericAPI(req, res, intentId);
    }
  } catch (error) {
    console.error('Paid request processing error:', error);
    res.status(500).json({
      error: 'Service processing failed',
      funds: 'automatically refunded',
      intentId: req.headers['payment-evidence'] ? JSON.parse(req.headers['payment-evidence']).intentId : null
    });
  }
}

// Handle AI chat requests
async function handleAIChat(req, res, intentId) {
  try {
    const { prompt, model = 'openai/gpt-4o-mini' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    // Call OpenRouter
    const aiResponse = await openRouter.callCompletion({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.7
    });

    if (!aiResponse.success) {
      throw new Error('AI service failed');
    }

    // Calculate actual cost
    const usage = aiResponse.usage;
    const cost = openRouter.calculateCost(usage, model);

    // Create provider receipt
    const providerAddress = process.env.AI_PROVIDER_ADDRESS || '0x742d35Cc6795C2c3A850473e17b10F75d08Cf10E8'; // Demo address
    const nonce = crypto.randomInt(1000000);
    const timestamp = Math.floor(Date.now() / 1000);

    const receipt = {
      intentId,
      usedAmount: Math.floor(cost * 1e6), // Convert to USDC smallest units
      tokensUsed: usage.total_tokens,
      model,
      provider: providerAddress,
      nonce,
      timestamp,
      signature: receiptVerifier.signReceipt({
        intentId,
        usedAmount: Math.floor(cost * 1e6),
        tokensUsed: usage.total_tokens,
        provider: providerAddress,
        nonce,
        timestamp,
        promptHash: crypto.createHash('sha256').update(prompt).digest('hex')
      }, GATEWAY_PRIVATE_KEY)
    };

    // Verify receipt locally
    const isValid = receiptVerifier.verifyReceipt(receipt);
    if (!isValid) {
      throw new Error('Receipt verification failed');
    }

    // Settle payment via Nexus
    const settlementTx = await nexusAdapter.settleIntent({
      intentId,
      recipient: providerAddress,
      amount: receipt.usedAmount,
      targetChain: 'arbitrum',
      targetToken: 'USDC'
    });

    // Record settlement on chain
    await nexusAdapter.recordSettlementOnChain(intentId, providerAddress, receipt.usedAmount, settlementTx);

    // Return response with settlement info
    res.json({
      result: {
        completion: aiResponse.choices[0].message.content,
        model,
        usage
      },
      settlement: {
        usedAmount: cost.toFixed(6),
        refundAmount: (0.05 - cost).toFixed(6), // 0.05 max budget
        provider: providerAddress,
        settlementTx,
        intentId
      }
    });

  } catch (error) {
    // Refund on error
    try {
      await nexusAdapter.refundIntent(intentId);
    } catch (refundError) {
      console.error('Refund failed:', refundError);
    }

    throw error;
  }
}

// Handle provider proxy requests
async function handleProviderProxy(req, res, intentId) {
  // This would proxy to registered providers
  // For now, return mock response
  res.status(501).json({
    error: 'Provider proxy not implemented yet',
    intentId,
    endpoint: req.path
  });
}

// Handle generic API requests
async function handleGenericAPI(req, res, intentId) {
  // For future API endpoints
  res.status(501).json({
    error: 'Generic API proxy not implemented yet',
    intentId,
    endpoint: req.path
  });
}

// Legacy test endpoint
app.post('/api/test-payment', (req, res) => {
  const intentId = `fluxpay:test-${crypto.randomUUID()}`;

  res.status(402).json({
    challengeType: 'x402',
    intentId,
    maxBudget: '0.050000',
    token: 'USDC',
    expiresAt: Math.floor(Date.now() / 1000) + (5 * 60),
    instructions: {
      intentId,
      token: 'USDC',
      amount: 0.05,
      expiry: Math.floor(Date.now() / 1000) + (5 * 60)
    },
    retryWith: {
      header: 'Payment-Evidence',
      value: { intentId, nexusTx: '<transaction_hash>' }
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 FluxPay x402 Gateway listening on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
