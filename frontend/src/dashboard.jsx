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
  const [testMode, setTestMode] = useState(false);
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

  // Fetch balance when connected (or in test mode)
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isConnected && !testMode) {
        setBalance(null);
        return;
      }

      setBalanceLoading(true);

      // Use mock data in test mode
      if (testMode) {
        const mockBalances = {
          USDC: {
            totalAmount: '5.24',
            breakdown: {
              ethereum: '1.13',
              polygon: '2.58',
              arbitrum: '1.26',
              avalanche: '0.27'
            }
          },
          USDT: {
            totalAmount: '3.67',
            breakdown: {
              ethereum: '1.45',
              polygon: '1.02',
              arbitrum: '0.87',
              avalanche: '0.33'
            }
          },
          ETH: {
            totalAmount: '0.0348',
            breakdown: {
              ethereum: '0.0124',
              polygon: '0.0091',
              arbitrum: '0.0089',
              avalanche: '0.0044'
            }
          }
        };

        const mockBalance = mockBalances[selectedToken] || mockBalances['USDC'];
        setBalance({
          ...mockBalance,
          token: selectedToken,
          address: testMode ? '0x742d35Cc6795C2c3A850473e17b10F75d08Cf10E8' : account,
          lastUpdated: new Date().toISOString()
        });
        setBalanceLoading(false);
        return;
      }

      try {
        // Call real API to fetch balance from multiple testnets
        const response = await fetch(`/api/user/${account}/balance?token=${selectedToken}`);

        if (response.ok) {
          const balanceData = await response.json();
          setBalance(balanceData);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Network error' }));
          console.error('Balance fetch failed:', errorData);
          setBalance({ error: errorData.error || 'Failed to fetch balances' });
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
        setBalance({ error: 'Network error - check console for details' });
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalance();
  }, [isConnected, account, selectedToken, testMode]);

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

  // Demo the complete HTTP 402 payment flow
  const demoCompletePaymentFlow = async () => {
    if (!isConnected && !testMode) {
      alert('Please connect your wallet first to demo the payment flow (or enable test mode)');
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      // Use mock data in test mode
      if (testMode) {
        setTimeout(() => {
          const mockChallenge = {
            challengeType: 'x402',
            intentId: `fluxpay:test-${Math.random().toString(36).substr(2, 9)}`,
            maxBudget: '0.05',
            token: 'USDC',
            expiresAt: Math.floor(Date.now() / 1000) + (5 * 60),
            instructions: {
              sdk: 'avail-nexus',
              method: 'intent.create',
              params: {
                intentId: `fluxpay:test-${Math.random().toString(36).substr(2, 9)}`,
                token: 'USDC',
                amount: '0.05',
                expiry: Math.floor(Date.now() / 1000) + (5 * 60)
              }
            }
          };

          setAiResult({
            step: 'challenge-received',
            challenge: mockChallenge,
            message: `🎯 Payment Required! Max budget: ${mockChallenge.maxBudget} USDC, Expires: ${
              new Date(mockChallenge.expiresAt * 1000).toLocaleTimeString()
            }\n\n**TEST MODE ENABLED**: This simulates a real HTTP 402 response!`,

            // Show what would happen next in a real implementation
            nextSteps: [
              '1. 🧪 [TEST MODE] Nexus SDK would create intent with challenge parameters',
              '2. 🧪 [TEST MODE] Funds would be locked in escrow across chains',
              '3. 🧪 [TEST MODE] Request would be retried with Payment-Evidence header',
              '4. 🧪 [TEST MODE] Gateway would validate intent & process AI request',
              '5. 🧪 [TEST MODE] OpenRouter would calculate tokens used & cost',
              '6. 🧪 [TEST MODE] Provider would create signed receipt',
              '7. 🧪 [TEST MODE] Gateway would verify receipt & settle payment',
              '8. 🧪 [TEST MODE] Automatic refund of unused funds'
            ]
          });
          setAiLoading(false);
        }, 1500); // Simulate network delay
        return;
      }

      // Step 1: Initial request - will get HTTP 402 challenge
      console.log('🔄 Step 1: Making initial AI request...');
      const initialResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          model: 'openai/gpt-4o-mini'
        })
      });

      if (initialResponse.status === 402) {
        // Step 2: Parse payment challenge
        try {
          const challenge = await initialResponse.json();
          console.log('💰 Step 2: Received payment challenge:', challenge);

        // Show challenge details to user
        setAiResult({
          step: 'challenge-received',
          challenge,
          message: `🎯 Payment Required! Max budget: ${challenge.maxBudget} USDC, Expires: ${
            new Date(challenge.expiresAt * 1000).toLocaleTimeString()
          }`,

          // Show what would happen next in a real implementation
          nextSteps: [
            '1. Create Nexus intent with challenge parameters',
            '2. Lock funds in escrow across chains',
            '3. Retry request with Payment-Evidence header',
            '4. Gateway validates intent & processes AI request',
            '5. OpenRouter calculates tokens used & cost',
            '6. Provider creates signed receipt',
            '7. Gateway verifies receipt & settles payment',
            '8. Automatic refund of unused funds'
          ]
        });

        return; // Stop here for demo - in real app, would proceed to payment
        } catch (jsonError) {
          console.error('Failed to parse payment challenge:', jsonError);
          setAiResult({
            step: 'error',
            error: `Invalid payment challenge response: ${initialResponse.status} ${initialResponse.statusText}`,
            message: 'Received HTTP 402 but could not parse payment challenge JSON'
          });
          return;
        }
      }

      // If no payment required (shouldn't happen in production)
      const result = await initialResponse.json();
      setAiResult({
        step: 'completed',
        result,
        message: 'Request completed without payment (demo mode)'
      });

    } catch (error) {
      console.error('Payment flow demo error:', error);
      setAiResult({
        step: 'error',
        error: error.message,
        message: 'Payment flow demonstration failed'
      });
    } finally {
      if (!testMode) {
        setAiLoading(false);
      }
    }
  };

  // Advanced AI chat demo (requires payment simulation but shows the concept)
  const testAIWithCostCalculation = async () => {
    if (!isConnected && !testMode) {
      alert('Please connect your wallet to see AI cost calculation (or enable test mode)');
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    // Use mock cost calculation in test mode
    if (testMode) {
      setTimeout(() => {
        const estimatedTokens = Math.ceil(aiPrompt.length / 4); // Rough token estimation
        const estimatedCost = (estimatedTokens * 0.006) / 1000000; // USDC per token

        setAiResult({
          step: 'cost-estimation',
          estimation: {
            inputTokens: Math.ceil(estimatedTokens * 0.8),
            outputTokens: Math.ceil(estimatedTokens * 0.2),
            totalTokens: estimatedTokens,
            estimatedCost: estimatedCost.toFixed(6),
            model: 'openai/gpt-4o-mini'
          },
          message: `💰 [TEST MODE] Estimated cost: ${estimatedCost.toFixed(6)} USDC for ~${estimatedTokens} tokens. In real mode, this would show exact pricing from OpenRouter.`,

          // Show what OpenRouter would do
          openRouterFlow: [
            '🧪 [TEST MODE] Would validate payment intent with Nexus',
            `🧪 [TEST MODE] Would call OpenRouter with prompt (${aiPrompt.length} chars)`,
            `🧪 [TEST MODE] Model: ${'openai/gpt-4o-mini'}`,
            '🧪 [TEST MODE] Would stream response while counting tokens',
            '🧪 [TEST MODE] Would calculate exact cost: prompt_tokens × $0.00015 + completion_tokens × $0.00060',
            '🧪 [TEST MODE] Would return response + token metrics + cost'
          ]
        });
        setAiLoading(false);
      }, 1000);
      return;
    }

    try {
      // First, calculate estimated costs
      const estimatedTokens = Math.ceil(aiPrompt.length / 4); // Rough token estimation
      const estimatedCost = (estimatedTokens * 0.006) / 1000000; // USDC per token

      console.log(`📊 Estimated tokens: ${estimatedTokens}, Cost: ${estimatedCost} USDC`);

      // Show cost breakdown before attempting
      setAiResult({
        step: 'cost-estimation',
        estimation: {
          inputTokens: Math.ceil(estimatedTokens * 0.8),
          outputTokens: Math.ceil(estimatedTokens * 0.2),
          totalTokens: estimatedTokens,
          estimatedCost: estimatedCost.toFixed(6),
          model: 'openai/gpt-4o-mini'
        },
        message: `💰 Estimated cost: ${estimatedCost.toFixed(6)} USDC for ~${estimatedTokens} tokens. Click "Proceed with Payment" to continue.`,

        // Show what OpenRouter would do
        openRouterFlow: [
          '• Validate payment intent with Nexus',
          `• Call OpenRouter with prompt (${aiPrompt.length} chars)`,
          `• Model: ${'openai/gpt-4o-mini'}`,
          '• Stream response while counting tokens',
          '• Calculate exact cost: prompt_tokens × $0.00015 + completion_tokens × $0.00060',
          '• Return response + token metrics + cost'
        ]
      });

    } catch (error) {
      setAiResult({
        step: 'error',
        error: error.message
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main role="main" aria-labelledby="main-heading">
      <div style={{
        maxWidth: activeView === 'extension' ? '1400px' : '900px',
        margin: '0 auto',
        backgroundColor: activeView === 'extension' ? '#f8f9fa' : '#f9f9f9',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {activeView === 'extension' ? (
          <PaymentExtension testMode={testMode} />
        ) : (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <h1
                id="main-heading"
                style={{
                  color: '#333',
                  margin: 0
                }}
              >
                🎯 HTTP 402 Demo - Trust-minimized API Payments
                {testMode && <span style={{ fontSize: '0.7em', color: '#007bff' }}> (TEST MODE)</span>}
              </h1>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  onClick={() => setTestMode(!testMode)}
                  style={{
                    backgroundColor: testMode ? '#28a745' : '#ffc107',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {testMode ? '🧪 TEST MODE ON' : '🚀 TEST MODE OFF'}
                </button>
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
            </div>

        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          {testMode ? (
            <div style={{
              backgroundColor: '#28a745',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '4px',
              display: 'inline-block',
              marginRight: '10px'
            }}>
              Mock Connected: 0x742d35Cc6795C2c3A850473e17b10F75d08Cf10E8
            </div>
          ) : (
            <WalletConnect />
          )}
        </div>

        {(isConnected || testMode) && (
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
              <div>
                <label
                  htmlFor="token-select"
                  id="token-select-label"
                  style={{
                    display: 'block',
                    marginBottom: '0.25rem',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    color: '#333'
                  }}
                >
                  Select Token
                </label>
                <select
                  id="token-select"
                  name="token-select"
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  aria-labelledby="token-select-label"
                  style={{
                    padding: '0.5rem',
                    border: '2px solid #007bff',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    backgroundColor: '#ffffff',
                    color: '#333'
                  }}
                >
                  {supportedTokens.map(token => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
              </div>
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

        <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr' }}>

          {/* Main HTTP 402 Demo Section - Full Width */}
          {(isConnected || testMode) && (
            <div style={{
              backgroundColor: '#ffffff',
              padding: '2rem',
              borderRadius: '8px',
              border: '3px solid #007bff',
              boxShadow: '0 4px 6px rgba(0,123,255,0.1)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-15px',
                left: '20px',
                backgroundColor: '#007bff',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                ⭐ MAIN DEMO - HTTP 402 Flow
              </div>

              <h2 style={{ color: '#333', marginTop: 0 }}>🚀 AI Chat with HTTP 402 Micropayments</h2>
              <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                Experience the future of API payments: AI services that charge micropayments using HTTP 402 status codes and blockchain escrow. No upfront costs, pay only for what you use!
              </p>

              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ask me anything about FluxPay, HTTP 402, micropayments, blockchain, or AI..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '1rem',
                  border: '2px solid #e9ecef',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  onClick={demoCompletePaymentFlow}
                  disabled={aiLoading}
                  style={{
                    backgroundColor: aiLoading ? '#ccc' : '#28a745',
                    color: 'white',
                    padding: '1rem 2rem',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1.1rem',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    flex: 1,
                    fontWeight: 'bold'
                  }}
                >
                  {aiLoading ? '💭 Processing...' : '🎯 Trigger HTTP 402 Payment Challenge'}
                </button>

                <button
                  onClick={testAIWithCostCalculation}
                  disabled={aiLoading}
                  style={{
                    backgroundColor: aiLoading ? '#ccc' : '#007bff',
                    color: 'white',
                    padding: '1rem 2rem',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1.1rem',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    flex: 1,
                    fontWeight: 'bold'
                  }}
                >
                  {aiLoading ? '📊 Calculating...' : '📊 Show Cost Estimation'}
                </button>
              </div>

              {aiResult && (
                <div style={{
                  backgroundColor: aiResult.step === 'error' ? '#f8d7da' : aiResult.step === 'challenge-received' ? '#fff3cd' : '#d4edda',
                  border: `1px solid ${aiResult.step === 'error' ? '#f5c6cb' : aiResult.step === 'challenge-received' ? '#ffeaa7' : '#c3e6cb'}`,
                  padding: '1.5rem',
                  borderRadius: '8px',
                  marginTop: '2rem'
                }}>
                  <h4 style={{
                    marginTop: 0,
                    color: aiResult.step === 'error' ? '#721c24' : aiResult.step === 'challenge-received' ? '#856404' : '#155724',
                    marginBottom: '1rem'
                  }}>
                    {aiResult.step === 'challenge-received' ? '🎯 HTTP 402 Payment Challenge Received!' :
                     aiResult.step === 'cost-estimation' ? '📊 Token Cost Estimation' :
                     aiResult.step === 'error' ? '❌ Error' : 'AI Response'}
                  </h4>

                  <div style={{ whiteSpace: 'pre-line', marginBottom: '1rem' }}>
                    {aiResult.message}
                  </div>

                  {/* Cost Estimation Display */}
                  {aiResult.step === 'cost-estimation' && aiResult.estimation && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{ backgroundColor: '#f8f9fa', padding: '0.5rem', borderRadius: '4px' }}>
                          <strong>Input Tokens:</strong> {aiResult.estimation.inputTokens}
                        </div>
                        <div style={{ backgroundColor: '#f8f9fa', padding: '0.5rem', borderRadius: '4px' }}>
                          <strong>Output Tokens:</strong> {aiResult.estimation.outputTokens}
                        </div>
                        <div style={{ backgroundColor: '#f8f9fa', padding: '0.5rem', borderRadius: '4px' }}>
                          <strong>Total Tokens:</strong> {aiResult.estimation.totalTokens}
                        </div>
                        <div style={{
                          backgroundColor: '#28a745',
                          color: 'white',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          textAlign: 'center'
                        }}>
                          <strong>Cost:</strong> {aiResult.estimation.estimatedCost} USDC
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OpenRouter Flow */}
                  {aiResult.openRouterFlow && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h5>How OpenRouter Calculates Cost:</h5>
                      <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                        {aiResult.openRouterFlow.map((step, index) => (
                          <li key={index} style={{ marginBottom: '0.25rem' }}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Workflow Steps */}
                  {aiResult.nextSteps && aiResult.step === 'challenge-received' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h5>🚀 Complete HTTP 402 Payment Flow:</h5>
                      <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6'
                      }}>
                        <ol style={{ margin: '0', paddingLeft: '1.5rem' }}>
                          {aiResult.nextSteps.map((step, index) => (
                            <li key={index} style={{ marginBottom: '0.5rem', lineHeight: '1.4' }}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}

                  {/* Challenge Details */}
                  {aiResult.challenge && (
                    <details style={{ marginTop: '1rem' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                        💡 View Full HTTP 402 Challenge JSON
                      </summary>
                      <pre style={{
                        backgroundColor: '#f8f9fa',
                        padding: '1rem',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '0.8rem',
                        marginTop: '0.5rem'
                      }}>
                        {JSON.stringify(aiResult.challenge, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Error Details */}
                  {aiResult.error && (
                    <div style={{
                      color: '#721c24',
                      backgroundColor: '#f8d7da',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      marginTop: '0.5rem'
                    }}>
                      <strong>Details:</strong> {aiResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Basic HTTP 402 Test */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '1.5rem',
            borderRadius: '8px',
            border: '2px solid #e9ecef'
          }}>
            <h3 style={{ color: '#333', marginTop: 0 }}>🧪 Basic HTTP 402 Test</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              Test the simplest HTTP 402 response without AI processing.
            </p>

            <button
              onClick={testPayment}
              disabled={loading}
              style={{
                backgroundColor: loading ? '#ccc' : '#17a2b8',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%'
              }}
            >
              {loading ? 'Testing...' : 'Test Basic HTTP 402'}
            </button>

            {paymentResult && (
              <div style={{
                backgroundColor: '#e7f3ff',
                border: '1px solid #b3d4fc',
                padding: '1rem',
                borderRadius: '4px',
                marginTop: '1rem'
              }}>
                <h4 style={{ marginTop: 0, color: '#0056b3' }}>Challenge Response:</h4>
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
      </main>
  );
};

export default Dashboard;
