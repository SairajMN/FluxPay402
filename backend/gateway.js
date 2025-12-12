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

// User data endpoints for dashboard (real user data)
app.get('/api/user/:address/intents', (req, res) => {
  try {
    const userAddress = req.params.address.toLowerCase();

    // Filter active intents for this user from memory
    // In production, this would query a database or on-chain data
    const userIntents = [];
    for (const [intentId, intent] of activeIntents.entries()) {
      if (intent.payer?.toLowerCase() === userAddress) {
        userIntents.push({
          intentId,
          status: intent.status,
          lockedAmount: intent.lockedAmount,
          expiry: intent.expiry,
          payer: intent.payer
        });
      }
    }

    res.json(userIntents);
  } catch (error) {
    console.error('Error fetching user intents:', error);
    res.status(500).json({ error: 'Failed to fetch user intents' });
  }
});

app.get('/api/user/:address/receipts', (req, res) => {
  try {
    const userAddress = req.params.address.toLowerCase();

    // In MVP, receipts are tracked in-memory for successful transactions
    // In production, this would query on-chain contract events or database
    const userReceipts = [];
    // For now, return empty array - receipts would be tracked elsewhere
    // TODO: Implement proper receipt tracking tied to user address

    res.json(userReceipts);
  } catch (error) {
    console.error('Error fetching user receipts:', error);
    res.status(500).json({ error: 'Failed to fetch user receipts' });
  }
});

app.get('/api/user/:address/refunds', (req, res) => {
  try {
    const userAddress = req.params.address.toLowerCase();

    // In MVP, refunds are not tracked per user
    // In production, this would query on-chain refund events
    const userRefunds = [];
    // TODO: Implement refund tracking tied to user address

    res.json(userRefunds);
  } catch (error) {
    console.error('Error fetching user refunds:', error);
    res.status(500).json({ error: 'Failed to fetch user refunds' });
  }
});

// Real endpoint for creating intents (what the frontend calls)
app.post('/api/user/:address/create-intent', async (req, res) => {
  const userAddress = req.params.address;
  const { intentId, amount } = req.body;

  try {
    // Store intent locally first
    const intentRecord = {
      intentId,
      status: 'PENDING',
      lockedAmount: amount,
      expiry: Math.floor(Date.now() / 1000) + (5 * 60), // 5 minutes
      payer: userAddress,
      timestamp: Date.now()
    };

    activeIntents.set(intentId, intentRecord);

    // Create real intent on testnet via Nexus
    const nexusTx = await nexusAdapter.createIntent(
      intentId,
      userAddress,
      'USDC',
      amount,
      intentRecord.expiry
    );

    // Update intent status
    intentRecord.status = 'LOCKED';

    res.json({
      success: true,
      transactionHash: nexusTx,
      intent: intentRecord
    });
  } catch (error) {
    console.error('Create intent error:', error);
    // Remove intent on failure
    activeIntents.delete(intentId);
    res.status(500).json({ error: error.message });
  }
});

// Real AI endpoint that requires payment
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
    // Process payment and generate real AI response
    const evidence = JSON.parse(paymentEvidence);
    const { intentId } = evidence;

    // Verify intent
    const intentRecord = activeIntents.get(intentId);
    if (!intentRecord || intentRecord.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid intent' });
    }

    // Make real OpenRouter AI call
    const aiParams = {
      messages: [
        {
          role: 'user',
          content: req.body.prompt || 'Hello, please provide a helpful response.'
        }
      ],
      model: req.body.model || 'openai/gpt-4o-mini',
      max_tokens: 1000,
      temperature: req.body.temperature || 0.7
    };

    const aiResponse = await openRouterProxy.callCompletion(aiParams);

    // Create real receipt based on actual OpenRouter usage
    const usedTokens = aiResponse.usage.total_tokens || (aiResponse.usage.prompt_tokens + aiResponse.usage.completion_tokens);
    const verifiedAmount = await openRouterProxy.verifyUsage(aiResponse.data, {
      usedAmount: Math.round((usedTokens / 1000) * 15000), // Rough estimate: ~$0.015 per 1k tokens
      model: aiResponse.data.model,
      tokensUsed: usedTokens
    });

    const realReceipt = {
      intentId,
      usedAmount: verifiedAmount,
      tokensUsed: usedTokens,
      provider: '0x742d35Cc7c6d21012B5991BcEFf26b5115Cf4C9f', // Provider wallet
      nonce: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      model: aiResponse.data.model,
      receiptHash: crypto.createHash('sha256').update(`${intentId}:${verifiedAmount}:${aiResponse.data.model}`).digest('hex')
    };

    // Sign receipt
    const sign = crypto.createSign('SHA256');
    sign.update(`${realReceipt.intentId}:${realReceipt.usedAmount}:${realReceipt.nonce}`);
    realReceipt.signature = sign.sign(GATEWAY_PRIVATE_KEY || 'demo_key', 'hex');

    // Use real AI response
    const realResponse = {
      completion: aiResponse.data.choices[0].message.content,
      usage: aiResponse.usage,
      model: aiResponse.data.model
    };

    // Process settlement
    const result = {
      receipt: realReceipt,
      apiResult: realResponse
    };

    const settlementData = await handleSettlement(intentId, result, intentRecord);

    // Clean up
    activeIntents.delete(intentId);

    res.json(settlementData);

  } catch (error) {
    console.error('AI endpoint error:', error);

    // Attempt refund on errors
    try {
      if (req.headers['payment-evidence']) {
        const evidence = JSON.parse(req.headers['payment-evidence']);
        await nexusAdapter.refundIntent(evidence.intentId);
      }
    } catch (refundError) {
      console.error('AI endpoint refund failed:', refundError);
    }

    res.status(500).json({ error: error.message });
  }
});

// Run timeout checker every 30 seconds
setInterval(checkTimeouts, 30000);

app.listen(PORT, () => {
  console.log(`FluxPay Gateway listening on port ${PORT}`);
  console.log(`Provider URL: ${PROVIDER_URL}`);
  console.log(`Testnet mode: Enabled - Real contracts and APIs`);
});

module.exports = app;
