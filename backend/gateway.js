const http = require('http');
const crypto = require('crypto');

// Environment variables
const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      message: 'FluxPay Gateway is running',
      time: new Date().toISOString()
    }));
    return;
  }

  if (req.url === '/api/test-payment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const intentId = crypto.randomUUID();

      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        challengeType: 'x402',
        intentId,
        maxBudget: '0.050000',
        token: 'USDC',
        expiresAt: Math.floor(Date.now() / 1000) + (5 * 60),
        payWith: 'nexus.createIntent',
        instructions: {
          intentId,
          payer: 'user_wallet',
          token: 'USDC',
          amount: 0.05,
          expiry: Math.floor(Date.now() / 1000) + (5 * 60)
        },
        retryWith: {
          header: 'Payment-Evidence',
          value: { intentId, nexusTx: '<transaction_hash>' }
        }
      }));
    });
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`FluxPay Gateway listening on port ${PORT}`);
  console.log(`Test at http://localhost:${PORT}/health`);
});

module.exports = server;
