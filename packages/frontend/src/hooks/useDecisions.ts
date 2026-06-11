'use client'

import { useEffect, useState } from 'react'
import { useReadContract, usePublicClient } from 'wagmi'
import { REGISTRY_ADDRESS, registryAbi } from '@/lib/contracts'

export interface ReasoningDoc {
  version: string
  timestamp: number
  vault: string
  totalAssetsMeth: string
  inputs: {
    apyBps: Record<string, number>
    balancesMeth: Record<string, string>
    nansenNetflowUsd: Record<string, number>
    elfaSentiment: Record<string, number | null>
    stale: { nansen: boolean; elfa: boolean }
  }
  scores: Record<string, number>
  decision: {
    targetBps: Record<string, number>
    mode: 'normal' | 'defensive'
  }
  rationale: string
  benchmark: {
    passiveHoldMeth: string
    vaultValueMeth: string
    perfDeltaBps: number
  }
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

const IPFS_GATEWAY = 'https://w3s.link/ipfs/'
const REFETCH_MS = 30_000

async function fetchIpfsDoc(cid: string): Promise<ReasoningDoc | null> {
  try {
    const res = await fetch(`${IPFS_GATEWAY}${cid}`, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return null
    return (await res.json()) as ReasoningDoc
  } catch {
    return null
  }
}

export function useDecisions(): { decisions: Decision[]; isLoading: boolean } {
  const publicClient = usePublicClient()

  const { data: countData, isLoading: countLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'decisionCount',
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
          })
        )
      )

      if (cancelled) return

      // Build initial decisions without IPFS docs, newest first
      const initial: Decision[] = structs
        .map((s, i) => ({
          index: i,
          timestamp: Number(s.timestamp),
          reasoningHash: s.reasoningHash as `0x${string}`,
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
