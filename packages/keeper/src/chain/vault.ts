import { type Address, type Hex } from 'viem'
import { env } from '../config.js'
import { publicClient, walletClient } from './clients.js'
import { vaultAbi, strategyAbi, erc20Abi } from './abis.js'

export interface StrategyState {
  key: string
  address: Address
  apyBps: bigint
  balanceMeth: bigint
  maxBps: bigint
}

export interface ChainState {
  totalAssets: bigint
  idleMeth: bigint
  lastRebalance: bigint
  cooldownSecs: bigint
  strategies: StrategyState[]
}

const VAULT = env.VAULT_ADDRESS as Address

const STRATEGY_KEYS: Record<string, string> = {
  [env.CMETH_STRATEGY.toLowerCase()]: 'cmeth',
  [env.AAVE_STRATEGY.toLowerCase()]: 'aave',
  [env.USDY_STRATEGY.toLowerCase()]: 'usdy',
}

export async function readChainState(): Promise<ChainState> {
  // Phase 1: vault-level reads
  const [totalAssets, lastRebalance, cooldownSecs, assetAddress, strategyAddresses] =
    await Promise.all([
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'totalAssets' }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'lastRebalance' }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'cooldown' }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'asset' }),
      publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getStrategies' }),
    ])

  // Phase 2: idle buffer = vault's own underlying balance
  const idleMeth = await publicClient.readContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT],
  })

  // Phase 3: per-strategy reads via multicall
  const strategyCallsApy = strategyAddresses.map((addr) => ({
    address: addr,
    abi: strategyAbi,
    functionName: 'getCurrentAPY' as const,
  }))
  const strategyCallsBal = strategyAddresses.map((addr) => ({
    address: addr,
    abi: strategyAbi,
    functionName: 'getBalance' as const,
  }))
  const strategyCallsCap = strategyAddresses.map((addr) => ({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'maxAllocationBps' as const,
    args: [addr] as const,
  }))

  const multicallResults = await publicClient.multicall({
    contracts: [...strategyCallsApy, ...strategyCallsBal, ...strategyCallsCap],
    allowFailure: false,
  })

  const n = strategyAddresses.length
  const apyResults = multicallResults.slice(0, n) as bigint[]
  const balResults = multicallResults.slice(n, 2 * n) as bigint[]
  const capResults = multicallResults.slice(2 * n, 3 * n) as bigint[]

  const strategies: StrategyState[] = strategyAddresses.map((addr, i) => ({
    key: STRATEGY_KEYS[addr.toLowerCase()] ?? addr,
    address: addr,
    apyBps: apyResults[i] ?? 0n,
    balanceMeth: balResults[i] ?? 0n,
    maxBps: capResults[i] ?? 0n,
  }))

  return { totalAssets, idleMeth, lastRebalance, cooldownSecs, strategies }
}

export async function simulateRebalance(
  strategyAddresses: Address[],
  targetBpsArray: bigint[],
  reasoningHash: Hex,
): Promise<void> {
  await publicClient.simulateContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'rebalance',
    args: [strategyAddresses, targetBpsArray, reasoningHash],
    account: walletClient.account,
  })
}

export async function submitRebalance(
  strategyAddresses: Address[],
  targetBpsArray: bigint[],
  reasoningHash: Hex,
): Promise<Hex> {
  await simulateRebalance(strategyAddresses, targetBpsArray, reasoningHash)

  const hash = await walletClient.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'rebalance',
    args: [strategyAddresses, targetBpsArray, reasoningHash],
  })

  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}
