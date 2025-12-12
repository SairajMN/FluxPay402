import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react'
import { WagmiConfig } from 'wagmi'
import { arbitrum, mainnet, polygon } from 'viem/chains'

// 1. Get projectId
const projectId = 'fluxpay-x402-demo' // This should be from env, but using demo for now

// 2. Create wagmiConfig
const metadata = {
  name: 'FluxPay x402',
  description: 'Real-Time AI & API Micropayments using HTTP 402',
  url: 'https://fluxpay402.vercel.app',
  icons: ['https://walletconnect.com/walletconnect-logo.png']
}

const chains = [mainnet, arbitrum, polygon]
const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata })

// 3. Create modal
createWeb3Modal({ wagmiConfig, projectId, chains })

export function Web3Provider({ children }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      {children}
    </WagmiConfig>
  )
}
