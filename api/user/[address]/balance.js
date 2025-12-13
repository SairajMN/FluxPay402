module.exports = async (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address required' });
    }

    const { token = 'USDC' } = req.query;

    // Return mock balances for demo purposes
    const mockBalances = {
      'USDC': {
        totalAmount: '5.24',
        breakdown: {
          ethereum: '1.13',
          polygon: '2.58',
          arbitrum: '1.26',
          avalanche: '0.27'
        }
      },
      'USDT': {
        totalAmount: '3.67',
        breakdown: {
          ethereum: '1.45',
          polygon: '1.02',
          arbitrum: '0.87',
          avalanche: '0.33'
        }
      },
      'ETH': {
        totalAmount: '0.0348',
        breakdown: {
          ethereum: '0.0124',
          polygon: '0.0091',
          arbitrum: '0.0089',
          avalanche: '0.0044'
        }
      }
    };

    const balances = mockBalances[token] || mockBalances['USDC'];

    res.json({
      ...balances,
      token,
      address,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};
