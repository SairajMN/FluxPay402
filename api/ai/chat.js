const crypto = require('crypto');
const { NexusAdapter } = require('../backend/nexusAdapter');
const { validateReceipt } = require('../backend/receiptVerifier');

// Initialize Nexus adapter
const nexusAdapter = new NexusAdapter();

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const paymentEvidence = req.headers['payment-evidence'];

    if (!paymentEvidence) {
      // PHASE 1: Return HTTP 402 Payment Required
      const intentId = crypto.randomBytes(16).toString('hex');

      // Estimate cost for AI chat (0.05 USDC max)
      const priceEstimate = {
        min: 0.001,
        max: 0.05
      };

      const challenge = {
        challengeType: 'x402',
        intentId,
        maxBudget: `${priceEstimate.max}00000`, // USDC wei-equivalent
        token: 'USDC',
        expiresAt: Math.floor(Date.now() / 1000) + (5 * 60), // 5 min expiry
        payWith: 'fluxpay:nexus-createIntent',
        instructions: {
          sdk: 'nexus.createIntent',
          params: {
            intentId,
            payer: '<user_wallet>',
            token: 'USDC',
            amount: `${priceEstimate.max}00000`,
            expiry: Math.floor(Date.now() / 1000) + (5 * 60)
          }
        },
        retryWith: {
          header: 'Payment-Evidence',
          value: { intentId, nexusTx: '<transaction_hash>' }
        }
      };

      console.log('AI Chat payment challenge generated:', challenge);
      return res.status(402).json(challenge);
    }

    // PHASE 2: Process payment evidence and provide AI response
    const evidence = JSON.parse(paymentEvidence);
    const { intentId, nexusTx } = evidence;

    console.log(`Processing AI chat for intent: ${intentId}`);

    // Validate intent exists and is locked
    try {
      await nexusAdapter.initialize();
      const intentStatus = await nexusAdapter.getIntentStatus(intentId);

      if (intentStatus.status !== 'LOCKED') {
        return res.status(402).json({ error: 'Intent not locked or invalid' });
      }

      if (intentStatus.amount < 7500) { // Minimum 0.0075 USDC for AI response
        return res.status(402).json({ error: 'Insufficient locked amount' });
      }
    } catch (error) {
      console.error('Intent validation failed:', error);
      return res.status(500).json({ error: 'Failed to validate payment intent' });
    }

    // Generate AI response
    const { prompt = "Explain FluxPay x402 payments", model = "gpt-4o-mini" } = req.body || {};

    // Mock AI response (in production, this would call OpenRouter)
    const aiResponse = {
      completion: `# FluxPay x402 Micropayments Explained

${prompt.startsWith('Explain') ? `**FluxPay x402** enables trust-minimized micropayments for AI and API services using HTTP 402 status codes and blockchain escrow.

## Key Features:
- **HTTP 402 Challenges**: APIs return payment requirements instead of authentication errors
- **Escrow-based**: Funds are locked before service execution using Nexus
- **Microprecision**: Pay exactly for compute resources used
- **Multi-chain**: Unified USDC across multiple blockchains

## How it Works:
1. Pay first via HTTP 402 payment challenge
2. Funds locked in escrow before service execution
3. Service generates verifable usage receipts
4. Automatic settlement based on actual consumption
5. Unused funds refunded instantly

**Your query processed successfully!**` : `Thank you for your question about "${prompt}". This micropayment-powered AI response was enabled by FluxPay's trust-minimized payment system.`}

Usage: 75 tokens (~$0.0075). Your locked funds were automatically settled.`,
      usage: {
        prompt_tokens: 15,
        completion_tokens: 75,
        total_tokens: 90,
        model: model,
        estimated_cost_usdc: 0.0075
      },
      model: model,
      finish_reason: "stop"
    };

    // Create and validate receipt
    const mockReceipt = {
      intentId,
      usedAmount: 7500, // 0.0075 USDC in wei-equivalent
      tokensUsed: 90,
      endpointHash: crypto.createHash('sha256').update('/api/ai/chat').digest('hex'),
      nonce: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      provider: '0x742d35Cc7c6d21012B5991BcEFf26b5115Cf4C9f', // Mock provider
      payoutChain: 'ethereum',
      model: model
    };

    // Sign receipt (mock signature for demo)
    const sigData = JSON.stringify({
      intentId: mockReceipt.intentId,
      usedAmount: mockReceipt.usedAmount,
      tokensUsed: mockReceipt.tokensUsed,
      endpointHash: mockReceipt.endpointHash,
      nonce: mockReceipt.nonce,
      timestamp: mockReceipt.timestamp,
      provider: mockReceipt.provider,
      payoutChain: mockReceipt.payoutChain
    }, Object.keys(mockReceipt).sort());

    // Mock provider signature (in production, provider signs this)
    const privateKey = process.env.PROVIDER_PRIVATE_KEY || 'demo_key';
    const sign = crypto.createSign('SHA256');
    sign.update(sigData);
    mockReceipt.signature = sign.sign(privateKey, 'hex');

    // Validate receipt
    if (!validateReceipt(mockReceipt)) {
      console.error('Generated receipt validation failed');
      return res.status(500).json({ error: 'Failed to validate receipt' });
    }

    // Settle via Nexus
    try {
      const settleResult = await nexusAdapter.settleIntent({
        intentId,
        recipient: mockReceipt.provider,
        amount: mockReceipt.usedAmount,
        targetChain: mockReceipt.payoutChain,
        targetToken: 'USDC'
      });

      const intentStatus = await nexusAdapter.getIntentStatus(intentId);
      const refundAmount = intentStatus.amount - mockReceipt.usedAmount;

      const result = {
        ...aiResponse,
        receipt: mockReceipt,
        settlement: {
          intentId,
          usedAmount: mockReceipt.usedAmount,
          settledTx: settleResult,
          refundAmount: Math.max(0, refundAmount),
          status: 'completed'
        }
      };

      console.log(`AI Chat processed: intent ${intentId}, settled ${mockReceipt.usedAmount} wei`);
      return res.json(result);

    } catch (settleError) {
      console.error('Settlement failed:', settleError);
      // Attempt refund on settlement failure
      try {
        await nexusAdapter.refundIntent(intentId);
        return res.status(500).json({ error: 'Service processed but settlement failed, funds refunded' });
      } catch (refundError) {
        return res.status(500).json({ error: 'Service processed but both settlement and refund failed' });
      }
    }

  } catch (error) {
    console.error('AI Chat error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Unable to process AI request'
    });
  }
};
