const crypto = require('crypto');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Generate a unique intent ID
    const intentId = crypto.randomBytes(16).toString('hex');

    // Simulate an amount from body or default
    const amount = req.body?.amount || 0.01; // Default 1 cent test

    // Create HTTP 402 challenge
    const challenge = {
      challengeType: 'x402',
      intentId,
      maxBudget: `${amount}00000`, // Convert to USDC wei-equivalent (multiply by 100000)
      token: 'USDC',
      expiresAt: Math.floor(Date.now() / 1000) + (5 * 60), // 5 min expiry
      payWith: 'fluxpay:nexus-createIntent',
      instructions: {
        sdk: 'nexus.createIntent',
        params: {
          intentId,
          payer: '<user_wallet>',
          token: 'USDC',
          amount: `${amount}00000`, // 0.01 USDC in wei
          expiry: Math.floor(Date.now() / 1000) + (5 * 60)
        }
      },
      retryWith: {
        header: 'Payment-Evidence',
        value: { intentId, nexusTx: '<transaction_hash>' }
      }
    };

    console.log('Test payment challenge generated:', challenge);

    return res.status(402).json(challenge);

  } catch (error) {
    console.error('Test payment error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Unable to process payment request'
    });
  }
};
