import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './dashboard.jsx';
import './index.css';

// Suppress Keplr wallet injection errors - we only use MetaMask/Ethereum
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const message = args.join(' ');
  // Suppress common Keplr and other wallet injection errors that don't affect our Ethereum-only app
  if (
    message.includes('installHook.js') ||
    message.includes('getOfflineSigner from keplr') ||
    message.includes('injectedScript.bundle.js') ||
    (message.includes('keplr') && message.includes('intercept')) ||
    (message.includes('Failed to load resource') && message.includes('404')) ||
    message.includes('wallet') && (message.includes('inject') || message.includes('intercept')) ||
    message.includes('cosmos') && message.includes('wallet')
  ) {
    return; // Silently suppress
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.join(' ');
  // Suppress common wallet-related warnings
  if (
    message.includes('keplr') ||
    message.includes('cosmos') ||
    message.includes('wallet') && (message.includes('inject') || message.includes('intercept'))
  ) {
    return; // Silently suppress
  }
  originalConsoleWarn.apply(console, args);
};

// Prevent wallet extensions from interfering with our Ethereum-only app
(function() {
  try {
    // Delete any injected wallet objects that might conflict
    if (window.keplr) delete window.keplr;
    if (window.cosmjs) delete window.cosmjs;
    if (window.getOfflineSigner) delete window.getOfflineSigner;
    if (window.getOfflineSignerOnlyAmino) delete window.getOfflineSignerOnlyAmino;
    if (window.getOfflineSignerAuto) delete window.getOfflineSignerAuto;
  } catch (e) {
    // Ignore any deletion errors
  }
})();

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
