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

  // Step 2: batch-read all decision structs
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

  // Persist IPFS docs across refetches so we never re-fetch the same CID
  const ipfsCacheRef = useRef<Map<string, ReasoningDoc | null>>(new Map())

  const [decisions, setDecisions] = useState<Decision[]>([])
  // ipfsReady tracks whether the current rawDecisions batch has been fully
  // resolved (chain structs + all IPFS blobs). Starts false; set to true
  // only after a complete commit so isLoading never flips false prematurely.
  const [ipfsReady, setIpfsReady] = useState(false)

  useEffect(() => {
    // While chain data is still in flight, leave ipfsReady as-is so we don't
    // show a skeleton flash during background 30s refetches of already-loaded data.
    if (countLoading || decisionsLoading || !rawDecisions) return

    const cache = ipfsCacheRef.current
    let cancelled = false

    const structs = rawDecisions
      .map((r, i) => {
        const s = r.result as unknown as DecisionStruct | undefined
        return s ? { index: i, s } : null
      })
      .filter((d): d is { index: number; s: DecisionStruct } => d !== null)
      .reverse()

    const missing = structs.filter(({ s }) => s.cid && !cache.has(s.cid))

    const buildDecisions = (): Decision[] =>
      structs.map(({ index, s }) => {
        const cached = cache.get(s.cid) ?? null
        return {
          index,
          timestamp: Number(s.timestamp),
          reasoningHash: s.reasoningHash,
          cid: s.cid,
          perfDeltaBps: Number(s.perfDeltaBps),
          totalAssets: s.totalAssets,
          reasoning: cached,
          ipfsLoading: false,
          ipfsError: cache.has(s.cid) && cached === null && !!s.cid,
        }
      })

    if (missing.length === 0) {
      // All blobs are cached — commit immediately in one render
      setDecisions(buildDecisions())
      setIpfsReady(true)
      return
    }

    // New blobs needed: mark not ready, fetch all in parallel, commit once
    setIpfsReady(false)
    Promise.all(
      missing.map(({ s }) =>
        fetchIpfsDoc(s.cid).then((doc) => { cache.set(s.cid, doc) })
      )
    ).then(() => {
      if (cancelled) return
      setDecisions(buildDecisions())
      setIpfsReady(true)
    })

    return () => { cancelled = true }
  }, [rawDecisions, countLoading, decisionsLoading])

  // count > 0 check: when there are no decisions yet, ipfsReady stays false
  // but we still want isLoading to resolve once chain confirms count = 0.
  const isLoading = countLoading || (count > 0 && (decisionsLoading || !ipfsReady))

  return { decisions, isLoading }
}
