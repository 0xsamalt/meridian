import type { Signals, AllocationResult } from '../engine/types.js'
import type { ChainState } from '../chain/vault.js'
import { env } from '../config.js'

export interface ReasoningDoc {
  version: '1.0'
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

export function buildReasoningJson(
  chainState: ChainState,
  signals: Signals,
  result: AllocationResult,
  perfDeltaBps: number,
): ReasoningDoc {
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    vault: env.VAULT_ADDRESS,
    inputs: {
      strategies: chainState.strategies.map((s) => ({
        key: s.key,
        apyBps: Number(s.apyBps),
        balanceMeth: s.balanceMeth.toString(),
        maxBps: Number(s.maxBps),
      })),
      signals: {
        smartMoneyNetflowUsd: signals.smartMoneyNetflowUsd,
        sentiment: signals.sentiment,
        nansenStale: signals.nansenStale,
        elfaStale: signals.elfaStale,
      },
    },
    scores: result.scores,
    decision: {
      targetBps: result.targetBps,
      mode: result.mode,
    },
    rationale: result.rationale,
    benchmark: {
      perfDeltaBps,
      totalAssetsMeth: chainState.totalAssets.toString(),
    },
  }
}
