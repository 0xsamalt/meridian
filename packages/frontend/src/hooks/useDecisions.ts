'use client'

import { useEffect, useState } from 'react'
import { useReadContract, usePublicClient } from 'wagmi'
import { REGISTRY_ADDRESS, registryAbi } from '@/lib/contracts'
import { mantleSepolia } from '@/lib/chains'

// Matches the shape produced by keeper/src/reasoning/build.ts exactly
export interface ReasoningDoc {
  version: string
  timestamp: string
  vault: string
  inputs: {
    strategies: Array<{
      key: string
      apyBps: number
      balanceMeth: string
      maxBps: number
    }>
    signals: {
      smartMoneyNetflowUsd: Record<string, number>
      sentiment: Record<string, number | null>
      nansenStale: boolean
      elfaStale: boolean
    }
  }
  scores: Record<string, number>
  decision: {
    targetBps: Record<string, number>
    mode: 'normal' | 'defensive'
  }
  rationale: string
  benchmark: {
    perfDeltaBps: number
    totalAssetsMeth: string
  }
}

// Local type for the MeridianRegistry.getDecision() return tuple
type DecisionStruct = {
  timestamp: bigint
  reasoningHash: `0x${string}`
  cid: string
  perfDeltaBps: bigint
  totalAssets: bigint
}

export interface Decision {
  index: number
  timestamp: number
  reasoningHash: `0x${string}`
  cid: string
  perfDeltaBps: number
  totalAssets: bigint
  reasoning: ReasoningDoc | null
  ipfsLoading: boolean
  ipfsError: boolean
}

const IPFS_GATEWAYS = [
  'https://dweb.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
]
const REFETCH_MS = 30_000

async function fetchIpfsDoc(cid: string): Promise<ReasoningDoc | null> {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const res = await fetch(`${gateway}${cid}`, { signal: AbortSignal.timeout(12_000) })
      if (res.ok) return (await res.json()) as ReasoningDoc
    } catch {
      // try next gateway
    }
  }
  return null
}

export function useDecisions(): { decisions: Decision[]; isLoading: boolean } {
  const publicClient = usePublicClient({ chainId: mantleSepolia.id })

  const { data: countData, isLoading: countLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'decisionCount',
    chainId: mantleSepolia.id,
    query: { refetchInterval: REFETCH_MS },
  })

  const count = Number(countData ?? 0n)

  const [decisions, setDecisions] = useState<Decision[]>([])
  const [chainLoading, setChainLoading] = useState(false)

  useEffect(() => {
    if (countLoading || count === 0 || !publicClient) return

    let cancelled = false
    setChainLoading(true)

    async function load() {
      // Read all decision structs in parallel
      const indices = Array.from({ length: count }, (_, i) => i)
      const structs = await Promise.all(
        indices.map((i) =>
          publicClient!.readContract({
            address: REGISTRY_ADDRESS,
            abi: registryAbi,
            functionName: 'getDecision',
            args: [BigInt(i)],
          }).then((r) => r as DecisionStruct)
        )
      )

      if (cancelled) return

      // Build initial decisions without IPFS docs, newest first
      const initial: Decision[] = structs
        .map((s, i) => ({
          index: i,
          timestamp: Number(s.timestamp),
          reasoningHash: s.reasoningHash,
          cid: s.cid,
          perfDeltaBps: Number(s.perfDeltaBps),
          totalAssets: s.totalAssets,
          reasoning: null,
          ipfsLoading: !!s.cid,
          ipfsError: false,
        }))
        .reverse()

      setDecisions(initial)
      setChainLoading(false)

      // Fetch IPFS blobs one by one, updating state as each arrives
      for (const d of initial) {
        if (cancelled || !d.cid) continue
        const doc = await fetchIpfsDoc(d.cid)
        if (cancelled) return
        setDecisions((prev) =>
          prev.map((p) =>
            p.index === d.index
              ? { ...p, reasoning: doc, ipfsLoading: false, ipfsError: doc === null }
              : p
          )
        )
      }
    }

    load().catch(() => setChainLoading(false))
    return () => { cancelled = true }
  }, [count, countLoading, publicClient])

  return { decisions, isLoading: countLoading || chainLoading }
}
