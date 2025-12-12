import { ethers } from 'ethers';
import React, { createContext, useContext, useState, useEffect } from 'react';

const Web3Context = createContext();

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = () => {
    return typeof window !== 'undefined' && window.ethereum && window.ethereum.isMetaMask;
  };

  // Check if Phantom is installed
  const isPhantomInstalled = () => {
    return typeof window !== 'undefined' && window.solana && window.solana.isPhantom;
  };

  // Connect to MetaMask or Phantom
  const connectWallet = async (walletType = 'metamask') => {
    setIsConnecting(true);

    try {
      if (walletType === 'metamask') {
        if (!isMetaMaskInstalled()) {
          alert('Please install MetaMask to use this dApp!');
          window.open('https://metamask.io/', '_blank');
          return;
        }

        try {
          // Request account access for MetaMask
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const ethersProvider = new ethers.BrowserProvider(window.ethereum);

          setAccount(accounts[0]);
          setProvider(ethersProvider);

          // Listen for account changes
          window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
              setAccount(accounts[0]);
            } else {
              setAccount(null);
            }
          });

          // Listen for chain changes
          window.ethereum.on('chainChanged', () => {
            window.location.reload();
          });
        } catch (error) {
          // Handle specific wallet errors
          if (error.code === 4001) {
            alert('Connection rejected by user. Please approve the connection in your wallet.');
          } else if (error.code === -32002) {
            alert('Connection request already pending. Please check your wallet.');
          } else {
            console.error('MetaMask connection error:', error);
            alert('Error connecting to MetaMask. Please make sure only one Ethereum wallet extension is enabled.');
          }
          return;
        }

      } else if (walletType === 'phantom') {
        if (!isPhantomInstalled()) {
          alert('Please install Phantom wallet to use this dApp!');
          window.open('https://phantom.app/', '_blank');
          return;
        }

        // Connect to Phantom for Solana
        try {
          const resp = await window.solana.connect();
          const publicKey = resp.publicKey.toString();

          setAccount(publicKey);
          setProvider({ isPhantom: true, phantom: window.solana });

          // Listen for account changes
          window.solana.on('accountChanged', (publicKey) => {
            if (publicKey) {
              setAccount(publicKey.toString());
            } else {
              setAccount(null);
            }
          });

        } catch (err) {
          console.error('Error connecting to Phantom:', err);
          alert('Error connecting to Phantom wallet. Please try again.');
          return;
        }
      }

    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Error connecting wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
  };

  // Check if already connected on load
  useEffect(() => {
    if (isMetaMaskInstalled() && window.ethereum.selectedAddress) {
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      setAccount(window.ethereum.selectedAddress);
      setProvider(ethersProvider);
    }
  }, []);

  const value = {
    account,
    provider,
    isConnected: !!account,
    isConnecting,
    connectWallet,
    disconnectWallet,
    isMetaMaskInstalled: isMetaMaskInstalled(),
    isPhantomInstalled: isPhantomInstalled()
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
}
