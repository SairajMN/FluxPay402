import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './dashboard.jsx';
import { Web3Provider } from './wallet.js';
import './index.css';

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
    <Web3Provider>
      <Dashboard />
    </Web3Provider>
  </React.StrictMode>
);
