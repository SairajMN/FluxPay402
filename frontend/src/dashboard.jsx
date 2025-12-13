import React, { useState, useEffect } from 'react';
import { WalletConnect } from './WalletConnect.jsx';
import { useWeb3 } from './wallet.js';
import PaymentExtension from './PaymentExtension.jsx';

const Dashboard = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [paymentResult, setPaymentResult] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Explain how FluxPay x402 micropayments work');
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState('USDC');
  const { isConnected, account } = useWeb3();

  // Available tokens
  const supportedTokens = [
    { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { symbol: 'USDT', name: 'Tether', decimals: 6 },
    { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  ];

  // Supported chains
  const supportedChains = [
    'ethereum', 'polygon', 'arbitrum', 'avalanche'
  ];

  // Fetch balance when connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isConnected || !account) {
        setBalance(null);
        return;
      }

      setBalanceLoading(true);
      try {
        // Mock balance data for multiple tokens (in production, this would call Nexus API)
        const mockBalances = {
          USDC: {
            totalAmount: '100.00',
            breakdown: {
              ethereum: '50.00',
              polygon: '25.00',
              arbitrum: '15.00',
              avalanche: '10.00'
            }
          },
          USDT: {
            totalAmount: '75.00',
            breakdown: {
              ethereum: '40.00',
              polygon: '20.00',
              arbitrum: '10.00',
              avalanche: '5.00'
            }
          },
          ETH: {
            totalAmount: '2.5000',
            breakdown: {
              ethereum: '1.5000',
              polygon: '0.5000',
              arbitrum: '0.3000',
              avalanche: '0.2000'
            }
          }
        };

        setBalance(mockBalances[selectedToken]);
      } catch (error) {
        console.error('Error fetching balance:', error);
        setBalance({ error: 'Network error' });
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalance();
  }, [isConnected, account, selectedToken]);

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
        maxWidth: activeView === 'extension' ? '1400px' : '900px',
        margin: '0 auto',
        backgroundColor: activeView === 'extension' ? '#f8f9fa' : '#f9f9f9',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {activeView === 'extension' ? (
          <PaymentExtension />
        ) : (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <h1 style={{
                color: '#333',
                margin: 0
              }}>
                FluxPay x402 - AI & API Micropayments
              </h1>
              <button
                onClick={() => setActiveView(activeView === 'dashboard' ? 'extension' : 'dashboard')}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                🎯 Payment Extension
              </button>
            </div>

        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <WalletConnect />
        </div>

        {isConnected && (
          <div style={{
            backgroundColor: '#ffffff',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '2px solid #e9ecef',
            marginBottom: '2rem'
          }}>
            {/* Token Selector */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h2 style={{ color: '#333', marginTop: 0 }}>
                {selectedToken} Balance
              </h2>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              >
                {supportedTokens.map(token => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
            </div>

            <p style={{ color: '#666' }}>
              Your unified FluxPay balance across all {supportedChains.length} supported chains
            </p>

            <div style={{
              fontSize: '3rem',
              fontWeight: 'bold',
              color: '#28a745',
              textAlign: 'center',
              padding: '1rem'
            }}>
              {balanceLoading ? 'Loading...' :
               balance?.error ? balance.error :
               balance?.totalAmount ? `${balance.totalAmount} ${selectedToken}` : `0.00 ${selectedToken}`}
            </div>

            {/* Chain Breakdown */}
            {balance?.breakdown && !balanceLoading && !balance?.error && (
              <div style={{
                textAlign: 'center',
                fontSize: '0.9rem',
                color: '#666',
                marginTop: '-0.5rem'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem',
                  marginTop: '1rem'
                }}>
                  {Object.entries(balance.breakdown).map(([chain, amount]) => (
                    <div key={chain} style={{
                      backgroundColor: '#f8f9fa',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #dee2e6'
                    }}>
                      <strong style={{ textTransform: 'capitalize' }}>{chain}:</strong> {amount} {selectedToken}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Supported Tokens Info */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#666'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>💰 Available Tokens:</span>
                <div>
                  {supportedTokens.map(token => (
                    <span key={token.symbol} style={{
                      marginLeft: '0.5rem',
                      padding: '0.2rem 0.5rem',
                      backgroundColor: '#007bff',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '0.75rem'
                    }}>
                      {token.symbol}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                🌐 Supported Chains: {supportedChains.join(', ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
            </div>
          </div>
        )}

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
            <li><strong>Multi-chain:</strong> Unified {supportedTokens.length} token balances across {supportedChains.length} blockchains</li>
          </ul>
          {!isConnected && (
            <p style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.5rem', borderRadius: '4px' }}>
              <strong>Note:</strong> Connect a Web3 wallet (MetaMask, Coinbase Wallet, etc.) to test full AI micropayment functionality.
            </p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
