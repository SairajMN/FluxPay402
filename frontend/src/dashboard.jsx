import React, { useState } from 'react';

const Dashboard = () => {
  const [paymentResult, setPaymentResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testPayment = async () => {
    setLoading(true);
    setPaymentResult(null);

    try {
      const response = await fetch('http://localhost:3001/api/test-payment', {
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
        setPaymentResult({ error: 'Expected HTTP 402 status, got ' + response.status });
      }
    } catch (error) {
      setPaymentResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: '800px',
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
          FluxPay Frontend - Basic Test
        </h1>

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
            marginBottom: '1rem'
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
            <h3 style={{ marginTop: 0, color: '#0056b3' }}>Payment Challenge Response:</h3>
            <pre style={{
              backgroundColor: '#f8f9fa',
              padding: '0.5rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.9rem'
            }}>
              {JSON.stringify(paymentResult, null, 2)}
            </pre>
          </div>
        )}

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px'
        }}>
          <h3 style={{ marginTop: 0 }}>Instructions:</h3>
          <p>This is a basic test of the HTTP 402 payment flow.</p>
          <p>Click the button to test the backend API that should return a payment required (402) response.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
