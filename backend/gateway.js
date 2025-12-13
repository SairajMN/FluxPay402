const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const ethers = require('ethers');
const { NexusAdapter } = require('./nexusAdapter.js');
const { ReceiptVerifier } = require('./receiptVerifier.js');
const { OpenRouterProxy } = require('./openRouterProxy.js');

// Environment variables
const PORT = process.env.PORT || 3002;
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

// Balance API for real testnet balance fetching
app.get('/api/user/:address/balance', async (req, res) => {
  try {
    const { address } = req.params;
    const { token = 'USDC' } = req.query;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const balances = await fetchRealBalances(address, token);
    res.json(balances);

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
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

// Function to fetch real testnet balances
async function fetchRealBalances(address, selectedToken = 'USDC') {
  const networks = [
    { name: 'ethereum', rpc: process.env.ETHEREUM_RPC || 'https://rpc.sepolia.org', chainId: 11155111 },
    { name: 'polygon', rpc: process.env.POLYGON_RPC || 'https://rpc-mumbai.maticvigil.com', chainId: 80001 },
    { name: 'arbitrum', rpc: process.env.ARBITRUM_RPC || 'https://goerli-rollup.arbitrum.io/rpc', chainId: 421613 },
    { name: 'avalanche', rpc: process.env.AVALANCHE_RPC || 'https://api.avax-test.network/ext/bc/C/rpc', chainId: 43113 }
  ];

  const tokenAddresses = {
    USDC: {
      ethereum: '0x07865c6e87b9F70255377e024ace6630C1Eaa37F', // Sepolia USDC
      polygon: '0x0FA8781a83E46826621b3BC094Ea2A0212e71B23', // Mumbai USDC
      arbitrum: '0x8FB1E3fC51F3b789577Ed7557E680551d93a0aA8', // Arbitrum Goerli USDC
      avalanche: '0x5425890298aed601595a70AB815c96711a31Bc650' // Fuji USDC
    },
    USDT: {
      ethereum: '0x7169D38820dfd117C3FA1f812bABA40966F532f70', // Sepolia USDT
      polygon: '0xA02f6adc7926efeBBd56...', // Mumbai USDT (placeholder)
      arbitrum: '0x8FB1E3fC51F3b789D...', // Arbitrum Goerli USDT (placeholder)
      avalanche: '0xAb231A5744C8Eennio...' // Fuji USDT (placeholder)
    },
    ETH: null // Native ETH doesn't need contract address
  };

  const balances = {};

  for (const network of networks) {
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc);

      if (selectedToken === 'ETH') {
        // Get native ETH balance
        const balance = await provider.getBalance(address);
        balances[network.name] = ethers.formatEther(balance);
      } else {
        // Get ERC20 token balance
        const tokenAddress = tokenAddresses[selectedToken]?.[network.name];
        if (!tokenAddress) {
          balances[network.name] = '0.00';
          continue;
        }

        // ERC20 ABI for balanceOf
        const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);

        const balance = await contract.balanceOf(address);
        const decimals = selectedToken === 'USDC' ? 6 : 6; // USDC/USDT have 6 decimals
        balances[network.name] = ethers.formatUnits(balance, decimals);
      }
    } catch (error) {
      console.error(`Failed to fetch ${selectedToken} balance on ${network.name}:`, error.message);
      balances[network.name] = '0.00';
    }
  }

  // Calculate total
  const total = Object.values(balances).reduce((sum, balance) => sum + parseFloat(balance), 0);

  return {
    totalAmount: total.toFixed(selectedToken === 'ETH' ? 4 : 2),
    breakdown: balances,
    token: selectedToken,
    address: address,
    lastUpdated: new Date().toISOString()
  };
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
