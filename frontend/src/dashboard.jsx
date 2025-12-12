import React, { useState } from 'react';
import { WalletConnect } from './WalletConnect.jsx';
import { useWeb3 } from './wallet.js';

const Dashboard = () => {
  const [paymentResult, setPaymentResult] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Explain how FluxPay x402 micropayments work');
  const { isConnected } = useWeb3();

  // Test basic HTTP 402 payment flow
  const testPayment = async () => {
    setLoading(true);
    setPaymentResult(null);

    try {
      const response = await fetch('/api/test-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: 0.05 })
      });

      if (response.status === 402) {
        const data = await response.json();
        setPaymentResult(data);
      } else {
        const data = await response.json().catch(() => ({ status: response.status }));
        setPaymentResult({ error: 'Expected HTTP 402 status', received: data });
      }
    } catch (error) {
      setPaymentResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Test AI chat with payment
  const testAIChat = async () => {
    if (!isConnected) {
      alert('Please connect your wallet first to test AI payments');
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          model: 'openai/gpt-4o-mini'
        })
      });

      if (response.status === 402) {
        const challenge = await response.json();
        setAiResult({
          challenge: challenge,
          message: 'Received payment challenge. In a real implementation, you would need to create an intent and provide payment evidence.'
        });
      } else {
        const data = await response.json();
        setAiResult(data);
      }
    } catch (error) {
      setAiResult({ error: error.message });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        backgroundColor: '#f9f9f9',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{
          color: '#333',
          marginBottom: '2rem'
        }}>
          FluxPay x402 - AI & API Micropayments
        </h1>

        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <WalletConnect />
        </div>

        <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: isConnected ? '1fr 1fr' : '1fr' }}>

          {/* HTTP 402 Payment Test */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '2px solid #e9ecef'
          }}>
            <h2 style={{ color: '#333', marginTop: 0 }}>HTTP 402 Payment Test</h2>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              Test basic payment required response from the API.
            </p>

            <button
              onClick={testPayment}
              disabled={loading}
              style={{
                backgroundColor: loading ? '#ccc' : '#007bff',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%'
              }}
            >
              {loading ? 'Testing...' : 'Test HTTP 402 Payment'}
            </button>

            {paymentResult && (
              <div style={{
                backgroundColor: '#e7f3ff',
                border: '1px solid #b3d4fc',
                padding: '1rem',
                borderRadius: '4px',
                marginTop: '1rem'
              }}>
                <h4 style={{ marginTop: 0, color: '#0056b3' }}>Payment Challenge:</h4>
                <pre style={{
                  backgroundColor: '#f8f9fa',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap'
                }}>
                  {JSON.stringify(paymentResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* AI Chat with Payment (only show when wallet connected) */}
          {isConnected && (
            <div style={{
              backgroundColor: '#ffffff',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '2px solid #e9ecef'
            }}>
              <h2 style={{ color: '#333', marginTop: 0 }}>AI Chat with Micropayments</h2>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                Test AI integration with x402 payment flow.
              </p>

              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Enter your message for AI..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.5rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  fontFamily: 'inherit'
                }}
              />

              <button
                onClick={testAIChat}
                disabled={aiLoading}
                style={{
                  backgroundColor: aiLoading ? '#ccc' : '#28a745',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {aiLoading ? 'Processing...' : 'Ask AI (Requires Payment)'}
              </button>

              {aiResult && (
                <div style={{
                  backgroundColor: '#d4edda',
                  border: '1px solid #c3e6cb',
                  padding: '1rem',
                  borderRadius: '4px',
                  marginTop: '1rem'
                }}>
                  <h4 style={{ marginTop: 0, color: '#155724' }}>AI Response:</h4>
                  {aiResult.error ? (
                    <div style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '0.5rem', borderRadius: '4px' }}>
                      Error: {aiResult.error}
                    </div>
                  ) : aiResult.challenge ? (
                    <div>
                      <p><strong>Payment Required!</strong></p>
                      <p>{aiResult.message}</p>
                      <details>
                        <summary>Challenge Details</summary>
                        <pre style={{
                          backgroundColor: '#f8f9fa',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          overflow: 'auto',
                          fontSize: '0.8rem',
                          marginTop: '0.5rem'
                        }}>
                          {JSON.stringify(aiResult.challenge, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div>
                      <pre style={{
                        backgroundColor: '#f8f9fa',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {JSON.stringify(aiResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px'
        }}>
          <h3 style={{ marginTop: 0 }}>About FluxPay x402</h3>
          <p><strong>FluxPay x402</strong> enables real-time micropayments for AI and API services using HTTP 402 (Payment Required) status codes and Avail Nexus for trust-minimized escrow.</p>
          <ul>
            <li><strong>HTTP 402 Flow:</strong> APIs return payment challenges instead of 401/403</li>
            <li><strong>Nexus Integration:</strong> Funds are locked in escrow before service execution</li>
            <li><strong>Micropayments:</strong> Pay only for what you use, down to individual API calls</li>
            <li><strong>Multi-chain:</strong> Unified USDC balances across Ethereum, Arbitrum, Polygon</li>
          </ul>
          {!isConnected && (
            <p style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.5rem', borderRadius: '4px' }}>
              <strong>Note:</strong> Connect a Web3 wallet (MetaMask, Coinbase Wallet, etc.) to test full AI micropayment functionality.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
