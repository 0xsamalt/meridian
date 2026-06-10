import { createConfig, http } from 'wagmi'
import { getDefaultConfig } from 'connectkit'
import { mantleSepolia } from './chains'

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mantleSepolia],
    transports: { [mantleSepolia.id]: http('https://rpc.sepolia.mantle.xyz') },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'Meridian',
    appDescription: 'AI-powered mETH yield optimizer on Mantle',
  }),
)
