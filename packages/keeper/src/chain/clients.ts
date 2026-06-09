import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { env } from '../config.js'

export const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: { http: [env.MANTLE_SEPOLIA_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Sepolia Explorer',
      url: 'https://explorer.sepolia.mantle.xyz',
    },
  },
  contracts: {
    // Standard Multicall3 — deployed at same address on all EVM chains
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
  testnet: true,
})

export const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(env.MANTLE_SEPOLIA_RPC),
})

export const keeperAccount = privateKeyToAccount(
  env.KEEPER_PRIVATE_KEY as `0x${string}`,
)

export const walletClient = createWalletClient({
  account: keeperAccount,
  chain: mantleSepolia,
  transport: http(env.MANTLE_SEPOLIA_RPC),
})
