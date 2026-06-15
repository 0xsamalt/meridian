'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
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
  // Step 1: read total decision count
  const { data: countData, isLoading: countLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'decisionCount',
    chainId: mantleSepolia.id,
    query: { refetchInterval: REFETCH_MS },
  })

  const count = Number(countData ?? 0n)

  // Step 2: batch-read all decision structs (avoids usePublicClient which can return undefined)
  const contracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: registryAbi,
        functionName: 'getDecision' as const,
        args: [BigInt(i)] as [bigint],
        chainId: mantleSepolia.id,
      })),
    [count],
  )

  const { data: rawDecisions, isLoading: decisionsLoading } = useReadContracts({
    contracts,
    query: { enabled: count > 0, refetchInterval: REFETCH_MS },
  })

  // Persist IPFS docs across refetches so we don't re-fetch on every 30s poll
  const ipfsCacheRef = useRef<Map<string, ReasoningDoc | null>>(new Map())

  const [decisions, setDecisions] = useState<Decision[]>([])

  useEffect(() => {
    if (countLoading || decisionsLoading || !rawDecisions) return

    const ipfsCache = ipfsCacheRef.current
    let cancelled = false

    const initial: Decision[] = rawDecisions
      .map((r, i) => {
        const s = r.result as unknown as DecisionStruct | undefined
        if (!s) return null
        const hasCached = ipfsCache.has(s.cid)
        const cachedDoc = ipfsCache.get(s.cid) ?? null
        return {
          index: i,
          timestamp: Number(s.timestamp),
          reasoningHash: s.reasoningHash,
          cid: s.cid,
          perfDeltaBps: Number(s.perfDeltaBps),
          totalAssets: s.totalAssets,
          reasoning: hasCached ? cachedDoc : null,
          ipfsLoading: !hasCached && !!s.cid,
          ipfsError: hasCached && cachedDoc === null && !!s.cid,
        }
      })
      .filter((d): d is Decision => d !== null)
      .reverse()

    setDecisions(initial)

    // Fetch IPFS blobs for any decision not yet cached, updating state as each arrives
    for (const d of initial) {
      if (!d.cid || ipfsCache.has(d.cid)) continue
      fetchIpfsDoc(d.cid).then((doc) => {
        ipfsCache.set(d.cid, doc) // cache before the cancelled check so refetches skip it
        if (cancelled) return
        setDecisions((prev) =>
          prev.map((p) =>
            p.index === d.index
              ? { ...p, reasoning: doc, ipfsLoading: false, ipfsError: doc === null }
              : p
          )
        )
      })
    }

    return () => { cancelled = true }
  }, [rawDecisions, countLoading, decisionsLoading])

  return { decisions, isLoading: countLoading || (count > 0 && decisionsLoading) }
}
