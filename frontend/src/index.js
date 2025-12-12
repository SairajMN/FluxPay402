import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './dashboard.jsx';
import { Web3Provider } from './wallet.js';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Web3Provider>
      <Dashboard />
    </Web3Provider>
  </React.StrictMode>
);
