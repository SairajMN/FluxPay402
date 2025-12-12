import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './dashboard.jsx';
import './index.css';

// Suppress Keplr wallet injection errors - we only use MetaMask/Ethereum
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args[0];
  // Suppress common Keplr injection errors that don't affect our Ethereum-only app
  if (typeof message === 'string' && (
    message.includes('installHook.js') ||
    message.includes('getOfflineSigner from keplr') ||
    message.includes('keplr') && message.includes('intercept')
  )) {
    return; // Silently suppress
  }
  originalConsoleError.apply(console, args);
};

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
);
