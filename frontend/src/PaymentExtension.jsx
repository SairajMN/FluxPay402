import React, { useState } from 'react';

/**
 * FluxPay Payment Extension - Razorpay-like Integration Dashboard
 * Allows external platforms to integrate FluxPay's micropayment system
 */
const PaymentExtension = () => {
  const [activeTab, setActiveTab] = useState('checkout');
  const [generatedCode, setGeneratedCode] = useState('');
  const [checkoutConfig, setCheckoutConfig] = useState({
    amount: 50,
    currency: 'USDC',
    name: 'My Platform',
    description: 'Payment for service',
    apiEndpoint: 'https://my-api.com',
    successUrl: 'https://my-platform.com/success',
    cancelUrl: 'https://my-platform.com/cancel',
    theme: 'light'
  });

  const [apiKey, setApiKey] = useState('fp_test_' + Math.random().toString(36).substr(2, 9));

  // Generate checkout integration code
  const generateCheckoutCode = () => {
    const code = `<!-- FluxPay Checkout Integration -->
<script src="https://fluxpay402.vercel.app/checkout.js"></script>
<script>
  const fluxpay = new FluxPay({
    key_id: '${apiKey}',
    amount: ${checkoutConfig.amount}00000, // Amount in smallest units (${checkoutConfig.currency})
    currency: '${checkoutConfig.currency}',
    name: '${checkoutConfig.name}',
    description: '${checkoutConfig.description}',
    api_endpoint: '${checkoutConfig.apiEndpoint}',
    handler: function(response) {
      console.log('Payment successful:', response);
      // Redirect to success page or handle in frontend
      window.location.href = '${checkoutConfig.successUrl}';
    },
    prefill: {
      name: 'Customer Name',
      email: 'customer@example.com'
    },
    theme: {
      color: '${checkoutConfig.theme === 'light' ? '#007bff' : '#000000'}'
    }
  });

  const payButton = document.getElementById('pay-button');
  payButton.onclick = function(e) {
    e.preventDefault();
    fluxpay.open();
  };
</script>

<!-- Your payment button -->
<button id="pay-button" style="background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer;">
  Pay $${(checkoutConfig.amount / 1000000).toFixed(6)} ${checkoutConfig.currency}
</button>`;

    setGeneratedCode(code);
  };

  // Generate API integration code
  const generateAPICode = () => {
    const code = `// Server-side FluxPay Integration
const axios = require('axios');

// 1. Initialize FluxPay client
const fluxpay = {
  apiKey: '${apiKey}',
  baseUrl: 'https://api.fluxpay402.vercel.app'
};

// 2. Create payment intent
async function createPaymentIntent(amount, currency, description) {
  try {
    const response = await axios.post(\`\${fluxpay.baseUrl}/api/payments/create\`, {
      amount: amount * 1000000, // Convert to smallest units
      currency: currency,
      description: description,
      api_endpoint: '${checkoutConfig.apiEndpoint}'
    }, {
      headers: {
        'Authorization': \`Bearer \${fluxpay.apiKey}\`,
        'Content-Type': 'application/json'
      }
    });

    return response.data; // Returns { id, client_secret, amount, currency }
  } catch (error) {
    console.error('Failed to create payment intent:', error);
    throw error;
  }
}

// 3. Handle payment completion
async function confirmPayment(paymentIntentId, paymentEvidence) {
  try {
    const response = await axios.post(\`\${fluxpay.baseUrl}/api/payments/confirm\`, {
      payment_intent_id: paymentIntentId,
      payment_evidence: paymentEvidence
    }, {
      headers: {
        'Authorization': \`Bearer \${fluxpay.apiKey}\`
      }
    });

    return response.data; // Returns settlement details
  } catch (error) {
    console.error('Payment confirmation failed:', error);
    throw error;
  }
}

// Usage example:
const paymentIntent = await createPaymentIntent(0.05, 'USDC', '${checkoutConfig.description}');
console.log('Payment Intent:', paymentIntent);

// After user completes payment, confirm it:
const settlement = await confirmPayment(paymentIntent.id, paymentEvidence);
console.log('Settlement:', settlement);`;

    setGeneratedCode(code);
  };

  // Generate SDK integration code
  const generateSDKCode = () => {
    const code = `// FluxPay SDK Integration (NPM package: npm install fluxpay-x402)
import { FluxPay } from 'fluxpay-x402';

const fluxpay = new FluxPay({
  apiKey: '${apiKey}',
  environment: 'test' // Use 'production' for live payments
});

// For frontend payment buttons
const handlePayment = async () => {
  try {
    // Create intent
    const intent = await fluxpay.payments.createIntent({
      amount: ${checkoutConfig.amount}00000,
      currency: '${checkoutConfig.currency}',
      description: '${checkoutConfig.description}',
      apiEndpoint: '${checkoutConfig.apiEndpoint}',
      successUrl: '${checkoutConfig.successUrl}',
      cancelUrl: '${checkoutConfig.cancelUrl}'
    });

    // Launch payment modal
    const result = await fluxpay.checkout.open({
      intentId: intent.id,
      theme: '${checkoutConfig.theme}'
    });

    if (result.success) {
      console.log('Payment successful:', result);
      // Handle success
    }
  } catch (error) {
    console.error('Payment failed:', error);
  }
};

// For API-first integrations
const createIntent = async () => {
  const intent = await fluxpay.payments.createIntent({
    amount: ${checkoutConfig.amount}00000,
    currency: '${checkoutConfig.currency}',
    description: '${checkoutConfig.description}',
    apiEndpoint: '${checkoutConfig.apiEndpoint}'
  });

  return intent.clientSecret; // Use in frontend
};`;

    setGeneratedCode(code);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    alert('Code copied to clipboard!');
  };

  const tabs = [
    { id: 'checkout', name: 'Checkout Widget', icon: '🎨' },
    { id: 'api', name: 'API Integration', icon: '🔌' },
    { id: 'sdk', name: 'SDK Usage', icon: '📦' },
    { id: 'docs', name: 'Documentation', icon: '📚' }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{
          textAlign: 'center',
          color: '#333',
          marginBottom: '1rem',
          fontSize: '2.5rem'
        }}>
          🎯 FluxPay Payment Extension
        </h1>
        <p style={{
          textAlign: 'center',
          color: '#666',
          fontSize: '1.2rem',
          marginBottom: '3rem'
        }}>
          Easy-to-integrate micropayment solution for your platform (like Razorpay for AI & APIs)
        </p>

        {/* API Key Display */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '2px solid #e9ecef',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginTop: 0 }}>🔑 Your API Key</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <code style={{
              backgroundColor: '#f8f9fa',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              fontSize: '1.1rem',
              flex: 1
            }}>
              {apiKey}
            </code>
            <button
              onClick={() => setApiKey('fp_live_' + Math.random().toString(36).substr(2, 9))}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔄 Regenerate
            </button>
          </div>
          <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Use this key to authenticate your integration. Keep it secure!
          </p>
        </div>

        {/* Integration Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '1rem',
                backgroundColor: activeTab === tab.id ? '#007bff' : '#ffffff',
                color: activeTab === tab.id ? 'white' : '#333',
                border: `2px solid ${activeTab === tab.id ? '#007bff' : '#e9ecef'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              {tab.icon} {tab.name}
            </button>
          ))}
        </div>

        {/* Configuration Panel */}
        {activeTab !== 'docs' && (
          <div style={{
            backgroundColor: '#ffffff',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '2px solid #e9ecef',
            marginBottom: '2rem'
          }}>
            <h3>⚙️ Configuration</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem'
            }}>
              {(activeTab === 'checkout' || activeTab === 'api' || activeTab === 'sdk') && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                      Amount (USDC)
                    </label>
                    <input
                      type="number"
                      value={checkoutConfig.amount / 1000000}
                      onChange={(e) => setCheckoutConfig({
                        ...checkoutConfig,
                        amount: parseFloat(e.target.value) * 1000000
                      })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                      Platform Name
                    </label>
                    <input
                      type="text"
                      value={checkoutConfig.name}
                      onChange={(e) => setCheckoutConfig({
                        ...checkoutConfig,
                        name: e.target.value
                      })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                      API Endpoint
                    </label>
                    <input
                      type="url"
                      value={checkoutConfig.apiEndpoint}
                      onChange={(e) => setCheckoutConfig({
                        ...checkoutConfig,
                        apiEndpoint: e.target.value
                      })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  {activeTab === 'checkout' && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Theme
                      </label>
                      <select
                        value={checkoutConfig.theme}
                        onChange={(e) => setCheckoutConfig({
                          ...checkoutConfig,
                          theme: e.target.value
                        })}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          fontSize: '1rem'
                        }}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              onClick={
                activeTab === 'checkout' ? generateCheckoutCode :
                activeTab === 'api' ? generateAPICode : generateSDKCode
              }
              style={{
                marginTop: '1rem',
                backgroundColor: '#007bff',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              🚀 Generate Integration Code
            </button>
          </div>
        )}

        {/* Code Output */}
        {generatedCode && activeTab !== 'docs' && (
          <div style={{
            backgroundColor: '#f8f9fa',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1rem',
              backgroundColor: '#e9ecef',
              fontWeight: 'bold',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>📋 Generated Code</span>
              <button
                onClick={copyToClipboard}
                style={{
                  backgroundColor: '#28a745',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                📝 Copy Code
              </button>
            </div>
            <pre style={{
              margin: 0,
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: '0.9rem',
              maxHeight: '400px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {generatedCode}
            </pre>
          </div>
        )}

        {/* Documentation Tab */}
        {activeTab === 'docs' && (
          <div style={{
            backgroundColor: '#ffffff',
            padding: '2rem',
            borderRadius: '8px',
            border: '2px solid #e9ecef'
          }}>
            <h2>📚 Integration Documentation</h2>

            <h3>🎯 What is FluxPay?</h3>
            <p>
              FluxPay is a trust-minimized micropayment system for APIs and AI services,
              inspired by HTTP 402 Payment Required protocol. It enables platforms to
              charge for API usage without storing funds or requiring user registration.
            </p>

            <h3>🔑 Key Features</h3>
            <ul>
              <li><strong>Micropayments:</strong> Pay only for what you use, down to individual API calls</li>
              <li><strong>Multi-Chain:</strong> Unified USDC balances across Ethereum, Polygon, Arbitrum</li>
              <li><strong>Automatic Refunds:</strong> SLA-based refunds when services fail</li>
              <li><strong>No Custody:</strong> Funds never held by FluxPay - escrow only</li>
              <li><strong>Cross-Platform:</strong> Works with any REST API or AI service</li>
            </ul>

            <h3>🚀 Quick Start</h3>
            <ol>
              <li>Get your API key from the section above</li>
              <li>Choose your integration method (Checkout/API/SDK)</li>
              <li>Configure your payment amounts and endpoints</li>
              <li>Generate and integrate the code into your platform</li>
              <li>Test with our sandbox environment</li>
            </ol>

            <h3>💰 Pricing</h3>
            <ul>
              <li><strong>Per Transaction:</strong> 0.1% fee per settlement</li>
              <li><strong>Settlement:</strong> Cross-chain fees vary by network</li>
              <li><strong>Free Tier:</strong> First 100 transactions free for testing</li>
            </ul>

            <h3>🔐 Security</h3>
            <ul>
              <li>Funds secured in Nexus escrow (no custody)</li>
              <li>Cryptographic receipt verification</li>
              <li>Automatic SLA refunds on service failure</li>
              <li>Blockchain-verifiable settlement proofs</li>
            </ul>

            <h3>📞 Support</h3>
            <p>
              Need help? Contact us at <a href="mailto:support@fluxpay402.com">support@fluxpay402.com</a>
              or visit our <a href="https://docs.fluxpay402.com">documentation</a>.
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '3rem',
          textAlign: 'center',
          color: '#666',
          fontSize: '0.9rem'
        }}>
          <p>
            🔒 Secure • ⚡ Fast • 🌐 Multi-Chain • 🤖 AI-Native
          </p>
          <p>
            Built for the API economy • Trust-minimized payments for every request
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentExtension;
