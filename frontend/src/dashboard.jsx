/**
 * @file dashboard.jsx
 * @description User Dashboard - Connect wallet, view intents, receipts, refunds
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { NexusSDK } from '@avail-project/nexus';

const Dashboard = () => {
  const [account, setAccount] = useState(null);
  const [intents, setIntents] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nexusSdk, setNexusSdk] = useState(null);
  const [nexusError, setNexusError] = useState(null);

  useEffect(() => {
    initNexus();
  }, []);

  const initNexus = async () => {
    try {
      const sdk = new NexusSDK({
        apiKey: process.env.REACT_APP_NEXUS_API_KEY,
        environment: 'testnet'
      });
      setNexusSdk(sdk);
    } catch (error) {
      console.error('Nexus init failed:', error);
      // For MVP, continue without Nexus SDK - some features will be disabled
      setNexusSdk(null);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask or another Web3 wallet!');
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const address = accounts[0];
      setAccount(address);

      // Load user data
      await loadUserData(address);
    } catch (error) {
      console.error('Wallet connection failed:', error);
      // Handle specific error cases
      if (error.code === 4001) {
        alert('User rejected the request.');
      } else if (error.code === -32002) {
        alert('Please check MetaMask - connection request already pending.');
      } else {
        alert('Wallet connection failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async (address) => {
    try {
      // Get unified balance from Nexus (if available)
      if (nexusSdk?.balance?.unified) {
        try {
          const userBalance = await nexusSdk.balance.unified({
            address,
            token: 'USDC'
          });
          setBalance(userBalance.totalAmount || 0);
        } catch (balanceError) {
          console.warn('Balance fetch failed:', balanceError);
          setBalance(0);
        }
      } else {
        // Nexus SDK not available, set demo balance
        setBalance(0);
      }

      // Load intents (from gateway API endpoint)
      const intentsResponse = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/user/${address}/intents`);
      const intentsData = await intentsResponse.json();
      setIntents(intentsData || []);

      // Load receipts
      const receiptsResponse = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/user/${address}/receipts`);
      const receiptsData = await receiptsResponse.json();
      setReceipts(receiptsData || []);

      // Load refunds
      const refundsResponse = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/user/${address}/refunds`);
      const refundsData = await refundsResponse.json();
      setRefunds(refundsData || []);

    } catch (error) {
      console.error('Failed to load user data:', error);
      // Set empty arrays on error for demo
      setIntents([]);
      setReceipts([]);
      setRefunds([]);
    }
  };

  const createIntentExample = async () => {
    if (!account) return;

    // Demo mode: Use the gateway endpoint for demo intents
    const intentId = `intent-${Date.now()}`;
    const amount = 50000; // 0.05 USDC in wei equivalent

    try {
      setLoading(true);
      const response = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/user/${account}/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intentId,
          amount
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`Intent created! ID: ${intentId}, Tx: ${result.transactionHash}`);
        // Reload data
        await loadUserData(account);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Intent creation failed:', error);
      alert('Failed to create intent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const [chatMessage, setChatMessage] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [currentIntentId, setCurrentIntentId] = useState(null);
  const [paymentRequired, setPaymentRequired] = useState(false);

  const submitChatMessage = async () => {
    if (!chatMessage.trim()) return;

    setLoading(true);
    setChatResponse('');

    try {
      // First attempt - may get HTTP 402
      const response = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: chatMessage
        })
      });

      if (response.status === 402) {
        // Payment required
        const challenge = await response.json();
        setCurrentIntentId(challenge.intentId);
        setPaymentRequired(true);
        setChatResponse('⚠️ Payment required to continue. Please pay the intent challenge below.');
        return;
      }

      // Got response
      const result = await response.json();
      setChatResponse(result.result.completion);
      setPaymentRequired(false);
      setCurrentIntentId(null);

      // Reload user data to show new receipts
      await loadUserData(account);

    } catch (error) {
      console.error('Chat failed:', error);
      setChatResponse('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const payForChat = async () => {
    if (!currentIntentId) return;

    // In demo mode, create the intent and retry the request
    try {
      setLoading(true);

      // Create intent
      const intentResponse = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/user/${account}/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intentId: currentIntentId,
          amount: 50000 // 0.05 USDC
        })
      });

      const intentResult = await intentResponse.json();

      if (intentResult.success) {
        // Now retry the chat with payment evidence
        const chatResponse = await fetch(`${process.env.REACT_APP_GATEWAY_URL}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Payment-Evidence': JSON.stringify({
              intentId: currentIntentId,
              nexusTx: intentResult.transactionHash
            })
          },
          body: JSON.stringify({
            prompt: chatMessage
          })
        });

        const result = await chatResponse.json();
        setChatResponse(result.result.completion);
        setPaymentRequired(false);
        setCurrentIntentId(null);

        // Reload user data
        await loadUserData(account);

        alert(`Payment successful! Used ${result.settlement.usedAmount} USDC, refunded ${result.settlement.refundAmount} USDC`);
      }
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setIntents([]);
    setReceipts([]);
    setRefunds([]);
    setBalance(0);
  };

  const formatAmount = (amount, decimals = 6) => {
    return (amount / Math.pow(10, decimals)).toFixed(decimals);
  };

  const getIntentStatusColor = (status) => {
    switch (status) {
      case 'LOCKED': return 'text-blue-600';
      case 'SETTLED': return 'text-green-600';
      case 'REFUNDED': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg">
          {/* Header */}
          <div className="px-4 py-5 sm:p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">FluxPay x402 Dashboard</h1>
              {!account ? (
                <button
                  onClick={connectWallet}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium"
                >
                  {loading ? 'Connecting...' : 'Connect Wallet'}
                </button>
              ) : (
                <div className="flex items-center space-x-4">
                  <span className={`text-sm ${nexusSdk ? 'text-green-600' : 'text-red-600'}`}>
                    Nexus: {nexusSdk ? 'Connected' : 'Disconnected'}
                  </span>
                  <span className="text-sm text-gray-500">
                    Balance: {formatAmount(balance)} USDC
                  </span>
                  <span className="text-sm text-gray-500">
                    {account.substring(0, 6)}...{account.substring(account.length - 4)}
                  </span>
                  <button
                    onClick={disconnectWallet}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          {!account ? (
            /* No wallet connected */
            <div className="p-8 text-center">
              <div className="mb-4">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connect Your Wallet</h3>
              <p className="text-gray-500 mb-4">
                Connect your wallet to view intents, receipts, and manage your payments.
              </p>
              <button
                onClick={connectWallet}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-3 rounded-md font-medium"
              >
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            /* Connected wallet view */
            <div className="divide-y divide-gray-200">
              {/* Demo AI Chat */}
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🚀 Demo AI Chat (HTTP 402 Payment Flow)</h2>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800 mb-2">
                    <strong>How it works:</strong> Try asking a question below. If it's your first time or costs exceed free tier,
                    you'll get an HTTP 402 payment required challenge. Pay the intent to get your AI response!
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-blue-700">
                    <span>💰 Cost: ~0.0075 USDC per 150 tokens</span>
                    <span>⚡ Instant settlement</span>
                    <span>🔄 Automatic refunds for unused funds</span>
                  </div>
                </div>

                <div className="mb-4">
                  <textarea
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask me anything about FluxPay, AI integration, or HTTP 402 payments..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>

                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={submitChatMessage}
                    disabled={loading || !chatMessage.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium flex items-center"
                  >
                    {loading ? 'Thinking...' : '💬 Ask AI'}
                  </button>

                  {paymentRequired && currentIntentId && (
                    <button
                      onClick={payForChat}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium flex items-center"
                    >
                      {loading ? 'Paying...' : '💳 Pay & Continue (0.05 USDC)'}
                    </button>
                  )}

                  <button
                    onClick={() => loadUserData(account)}
                    disabled={loading}
                    className="bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white px-3 py-2 rounded-md text-sm"
                  >
                    🔄 Refresh
                  </button>
                </div>

                {chatResponse && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">AI Response:</h4>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {chatResponse}
                    </div>
                  </div>
                )}

                {paymentRequired && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <h4 className="font-medium text-yellow-800">Payment Required (HTTP 402)</h4>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      Intent ID: <code className="font-mono text-xs bg-yellow-100 px-1 rounded">{currentIntentId}</code>
                    </p>
                    <p className="text-sm text-yellow-700">
                      Click "Pay & Continue" to create an intent and complete your request.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Actions</h2>
                <button
                  onClick={createIntentExample}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium mr-4"
                >
                  {loading ? 'Creating...' : 'Create Intent (Example)'}
                </button>
                <button
                  onClick={() => loadUserData(account)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium"
                >
                  Refresh Data
                </button>
                <p className="text-sm text-gray-500 mt-2">
                  This creates a regular intent without API usage. Use the chat above for the full payment flow demo.
                </p>
              </div>

              {/* Active Intents */}
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Active Intents</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intent ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Experience</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {intents.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-4 py-4 text-center text-gray-500">
                            No active intents
                          </td>
                        </tr>
                      ) : (
                        intents.map((intent) => (
                          <tr key={intent.intentId}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-mono">
                              {intent.intentId}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              <span className={getIntentStatusColor(intent.status)}>
                                {intent.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {formatAmount(intent.lockedAmount)} USDC
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {new Date(intent.expiry * 1000).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Receipts */}
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Usage Receipts</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intent ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Used</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {receipts.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-4 py-4 text-center text-gray-500">
                            No receipts yet
                          </td>
                        </tr>
                      ) : (
                        receipts.map((receipt) => (
                          <tr key={receipt.intentId}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-mono">
                              {receipt.intentId}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {formatAmount(receipt.usedAmount)} USDC
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {receipt.tokensUsed || 'N/A'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {receipt.provider.substring(0, 8)}...
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {new Date(receipt.timestamp * 1000).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refunds */}
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Refunds</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intent ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Refund Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx Hash</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {refunds.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-4 py-4 text-center text-gray-500">
                            No refunds
                          </td>
                        </tr>
                      ) : (
                        refunds.map((refund) => (
                          <tr key={refund.intentId}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-mono">
                              {`${refund.intentId.substring(0, 8)}...`}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {formatAmount(refund.amount)} USDC
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              {refund.reason || 'Timeout'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-mono">
                              {refund.nexusTx ? `${refund.nexusTx.substring(0, 8)}...` : 'Pending'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
