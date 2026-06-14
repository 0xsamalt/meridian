'use client'

import { useReadContracts } from 'wagmi'
import {
  VAULT_ADDRESS,
  CMETH_STRATEGY,
  AAVE_STRATEGY,
  USDY_STRATEGY,
  STRATEGY_META,
  vaultAbi,
  strategyAbi,
} from '@/lib/contracts'

export interface StrategyState {
  address: `0x${string}`
  key: string
  label: string
  color: string
  balanceMeth: bigint
  apyBps: bigint
  maxBps: bigint
  allocationPct: number
}

export interface VaultState {
  totalAssets: bigint
  totalSupply: bigint
  idleMeth: bigint
  lastRebalance: bigint
  cooldown: bigint
  sharePrice: bigint
  strategies: StrategyState[]
  isLoading: boolean
}

const STRATEGIES = [CMETH_STRATEGY, AAVE_STRATEGY, USDY_STRATEGY] as const

const REFETCH_MS = 15_000

export function useVaultState(): VaultState {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalAssets' },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalSupply' },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'lastRebalance' },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'cooldown' },
      // per-strategy caps
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'maxAllocationBps', args: [CMETH_STRATEGY] },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'maxAllocationBps', args: [AAVE_STRATEGY] },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'maxAllocationBps', args: [USDY_STRATEGY] },
      // per-strategy balances
      { address: CMETH_STRATEGY, abi: strategyAbi, functionName: 'getBalance' },
      { address: AAVE_STRATEGY,  abi: strategyAbi, functionName: 'getBalance' },
      { address: USDY_STRATEGY,  abi: strategyAbi, functionName: 'getBalance' },
      // per-strategy APY
      { address: CMETH_STRATEGY, abi: strategyAbi, functionName: 'getCurrentAPY' },
      { address: AAVE_STRATEGY,  abi: strategyAbi, functionName: 'getCurrentAPY' },
      { address: USDY_STRATEGY,  abi: strategyAbi, functionName: 'getCurrentAPY' },
    ],
    query: { refetchInterval: REFETCH_MS },
  })

  const totalAssets  = (data?.[0]?.result as bigint | undefined) ?? 0n
  const totalSupply  = (data?.[1]?.result as bigint | undefined) ?? 0n
  const lastRebalance = (data?.[2]?.result as bigint | undefined) ?? 0n
  const cooldown     = (data?.[3]?.result as bigint | undefined) ?? 0n

  const maxBps = [
    (data?.[4]?.result as bigint | undefined) ?? 0n,
    (data?.[5]?.result as bigint | undefined) ?? 0n,
    (data?.[6]?.result as bigint | undefined) ?? 0n,
  ]
  const balances = [
    (data?.[7]?.result as bigint | undefined) ?? 0n,
    (data?.[8]?.result as bigint | undefined) ?? 0n,
    (data?.[9]?.result as bigint | undefined) ?? 0n,
  ]
  const apys = [
    (data?.[10]?.result as bigint | undefined) ?? 0n,
    (data?.[11]?.result as bigint | undefined) ?? 0n,
    (data?.[12]?.result as bigint | undefined) ?? 0n,
  ]

  const deployedMeth = balances.reduce((acc, b) => acc + b, 0n)
  const idleMeth = totalAssets > deployedMeth ? totalAssets - deployedMeth : 0n

  // totalSupply is 24-decimal (18 + _decimalsOffset 6); multiply by 1e24 so result stays in 1e18 scale
  const sharePrice =
    totalAssets > 0n && totalSupply > 0n
      ? (totalAssets * 1_000_000_000_000_000_000_000_000n) / totalSupply
      : BigInt(1e18)

  const strategies: StrategyState[] = STRATEGIES.map((addr, i) => {
    const meta = STRATEGY_META[addr]
    const allocationPct =
      totalAssets > 0n ? Number((balances[i] * 10000n) / totalAssets) / 100 : 0
    return {
      address: addr,
      key: meta.key,
      label: meta.label,
      color: meta.color,
      balanceMeth: balances[i],
      apyBps: apys[i],
      maxBps: maxBps[i],
      allocationPct,
    }
  })

  return { totalAssets, totalSupply, idleMeth, lastRebalance, cooldown, sharePrice, strategies, isLoading }
}
