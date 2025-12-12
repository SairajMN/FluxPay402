import { useWeb3 } from './wallet.js'

export function WalletConnect() {
  const { account, isConnected, isConnecting, connectWallet, disconnectWallet, isMetaMaskInstalled } = useWeb3()

  if (isConnected && account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          backgroundColor: '#28a745',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          Connected: {account.slice(0, 6)}...{account.slice(-4)}
        </span>
        <button
          onClick={disconnectWallet}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={connectWallet}
      disabled={isConnecting}
      style={{
        backgroundColor: isConnecting ? '#ccc' : '#007bff',
        color: 'white',
        border: 'none',
        padding: '10px 20px',
        borderRadius: '5px',
        cursor: isConnecting ? 'not-allowed' : 'pointer',
        fontSize: '16px'
      }}
    >
      {isConnecting ? 'Connecting...' : isMetaMaskInstalled ? 'Connect MetaMask' : 'Install MetaMask'}
    </button>
  )
}
