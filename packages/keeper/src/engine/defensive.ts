import type { StrategySnapshot, AllocationResult, EngineConfig } from './types.js'

// Default defensive split: cmeth 50%, aave 30%, usdy 15%, idle 5%
const DEFENSIVE_BPS: Record<string, number> = {
  cmeth: 5000,
  aave: 3000,
  usdy: 1500,
}

export function defensiveAllocation(
  strategies: StrategySnapshot[],
  config: EngineConfig,
): AllocationResult {
  const capped: Record<string, number> = {}
  let stratTotal = 0

  for (const s of strategies) {
    const raw = DEFENSIVE_BPS[s.key] ?? 0
    const bps = s.maxBps > 0 ? Math.min(raw, s.maxBps) : raw
    capped[s.key] = bps
    stratTotal += bps
  }

  // Scale down if strategy total would eat into the idle floor
  const maxStratTotal = 10_000 - config.idleFloorBps
  if (stratTotal > maxStratTotal) {
    let scaled = 0
    const keys = Object.keys(capped).sort((a, b) => (capped[b] ?? 0) - (capped[a] ?? 0))
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!
      if (i === keys.length - 1) {
        capped[k] = maxStratTotal - scaled
      } else {
        const v = Math.floor(((capped[k] ?? 0) / stratTotal) * maxStratTotal)
        capped[k] = v
        scaled += v
      }
    }
    stratTotal = maxStratTotal
  }

  capped['idle'] = 10_000 - stratTotal

  const scores: Record<string, number> = {}
  for (const s of strategies) {
    scores[s.key] = s.apyBps / 100
  }

  return {
    targetBps: capped,
    scores,
    rationale:
      'Defensive mode: both signal sources stale or missing. ' +
      'Allocating conservatively to safest venues with enlarged idle buffer.',
    mode: 'defensive',
  }
}
