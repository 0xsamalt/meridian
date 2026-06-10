import type { StrategySnapshot, Signals, AllocationResult, EngineConfig } from './types.js'
import { defensiveAllocation } from './defensive.js'

// Maps strategy key → the signal dict key used for netflow + sentiment lookup
const STRATEGY_SIGNAL_KEY: Record<string, string> = {
  cmeth: 'mETH',
  aave: 'WETH',
  usdy: 'USDC',
}

// $1 M reference for netflow normalisation (linear clamp to [-1, 1])
const NETFLOW_SCALE = 1_000_000

export function computeAllocation(
  strategies: StrategySnapshot[],
  signals: Signals,
  config: EngineConfig,
): AllocationResult {
  if (signals.nansenStale && signals.elfaStale) {
    return defensiveAllocation(strategies, config)
  }

  const rawScores: Record<string, number> = {}
  const maxBpsMap: Record<string, number> = {}

  for (const s of strategies) {
    const yieldScore = s.apyBps / 100
    const riskPenalty = config.riskWeight * s.protocolRiskScore
    const liqSafe = Math.max(1, s.liquidityUsd)
    const liqBonus = Math.max(0, Math.min(1, Math.log10(liqSafe) / 8))

    const signalKey = STRATEGY_SIGNAL_KEY[s.key] ?? s.key
    const netflowUsd = signals.smartMoneyNetflowUsd[signalKey] ?? 0
    const sentimentRaw = signals.sentiment[signalKey]
    const sentiment = sentimentRaw ?? 0

    const nf = Math.max(-1, Math.min(1, netflowUsd / NETFLOW_SCALE))
    const rawTilt = config.signalWeight * (0.7 * nf + 0.3 * sentiment)
    const signalTilt = Math.max(-config.maxTilt, Math.min(config.maxTilt, rawTilt))

    rawScores[s.key] = Math.max(0, yieldScore * (1 + signalTilt) + liqBonus - riskPenalty)
    maxBpsMap[s.key] = s.maxBps
  }

  const stratTargetTotal = 10_000 - config.idleFloorBps
  let bps = normalizeToBps(rawScores, stratTargetTotal)
  bps = applyCaps(bps, maxBpsMap)
  bps = renormalize(bps, maxBpsMap, stratTargetTotal)
  const targetBps = enforceIdleFloor(bps, config.idleFloorBps)

  return {
    targetBps,
    scores: rawScores,
    rationale: buildRationale(strategies, rawScores, signals, targetBps, config),
    mode: 'normal',
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function normalizeToBps(scores: Record<string, number>, targetTotal: number): Record<string, number> {
  const keys = Object.keys(scores)
  if (keys.length === 0) return {}

  const total = Object.values(scores).reduce((s, v) => s + v, 0)

  if (total === 0) {
    const even = Math.floor(targetTotal / keys.length)
    const remainder = targetTotal - even * keys.length
    return Object.fromEntries(keys.map((k, i) => [k, i === 0 ? even + remainder : even]))
  }

  // Assign floors, then give the rounding remainder to the top scorer
  const sorted = [...keys].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
  const result: Record<string, number> = {}
  let assigned = 0

  for (let i = 0; i < sorted.length; i++) {
    const k = sorted[i]!
    if (i === sorted.length - 1) {
      result[k] = targetTotal - assigned
    } else {
      const bps = Math.floor(((scores[k] ?? 0) / total) * targetTotal)
      result[k] = bps
      assigned += bps
    }
  }
  return result
}

function applyCaps(bps: Record<string, number>, maxBps: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(bps).map(([k, v]) => [k, Math.min(v, maxBps[k] ?? v)]),
  )
}

function renormalize(
  bps: Record<string, number>,
  maxBps: Record<string, number>,
  targetTotal: number,
): Record<string, number> {
  let result = { ...bps }

  for (let iter = 0; iter < 10; iter++) {
    const currentSum = Object.values(result).reduce((s, v) => s + v, 0)
    const deficit = targetTotal - currentSum
    if (deficit <= 0) break

    const uncapped = Object.keys(result).filter(k => (result[k] ?? 0) < (maxBps[k] ?? 10_000))
    if (uncapped.length === 0) break

    const uncappedSum = uncapped.reduce((s, k) => s + (result[k] ?? 0), 0)
    const newResult = { ...result }
    let totalAdded = 0

    for (let i = 0; i < uncapped.length; i++) {
      const k = uncapped[i]!
      const cur = result[k] ?? 0
      const cap = maxBps[k] ?? 10_000

      const share =
        uncappedSum > 0
          ? Math.floor((cur / uncappedSum) * deficit)
          : Math.floor(deficit / uncapped.length)

      const toAdd = i < uncapped.length - 1 ? share : deficit - totalAdded
      const newVal = Math.min(cur + Math.max(0, toAdd), cap)
      totalAdded += newVal - cur
      newResult[k] = newVal
    }

    // Detect no-progress (all uncapped hit their caps this round)
    const progressed = Object.keys(newResult).some(k => newResult[k] !== result[k])
    result = newResult
    if (!progressed) break
  }

  return result
}

function enforceIdleFloor(bps: Record<string, number>, idleFloorBps: number): Record<string, number> {
  const stratTotal = Object.values(bps).reduce((s, v) => s + v, 0)
  const maxStratTotal = 10_000 - idleFloorBps

  if (stratTotal <= maxStratTotal) {
    return { ...bps, idle: 10_000 - stratTotal }
  }

  // Safety valve: scale strategy allocations down so idle floor is respected
  const keys = Object.keys(bps).sort((a, b) => (bps[b] ?? 0) - (bps[a] ?? 0))
  const result: Record<string, number> = {}
  let assigned = 0

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!
    if (i === keys.length - 1) {
      result[k] = maxStratTotal - assigned
    } else {
      const scaled = Math.floor(((bps[k] ?? 0) / stratTotal) * maxStratTotal)
      result[k] = scaled
      assigned += scaled
    }
  }

  result['idle'] = idleFloorBps
  return result
}

function buildRationale(
  strategies: StrategySnapshot[],
  scores: Record<string, number>,
  signals: Signals,
  targetBps: Record<string, number>,
  config: EngineConfig,
): string {
  const parts: string[] = []

  const sorted = [...strategies].sort((a, b) => (scores[b.key] ?? 0) - (scores[a.key] ?? 0))
  const top = sorted[0]
  if (top !== undefined) {
    parts.push(
      `${top.key.toUpperCase()} scored highest (${(scores[top.key] ?? 0).toFixed(2)}) ` +
        `with ${top.apyBps}bps APY → allocated ${targetBps[top.key] ?? 0}bps.`,
    )
  }

  if (!signals.nansenStale) {
    const flows = Object.entries(signals.smartMoneyNetflowUsd)
      .filter(([, v]) => Math.abs(v) > 10_000)
      .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}$${(v / 1000).toFixed(0)}k`)
    if (flows.length > 0) parts.push(`Smart-money flows: ${flows.join(', ')}.`)
  }

  if (signals.nansenStale) parts.push('Nansen data stale — netflow tilt zeroed.')
  if (signals.elfaStale) parts.push('Elfa data stale — sentiment tilt zeroed.')

  parts.push(
    `Idle buffer: ${targetBps['idle'] ?? config.idleFloorBps}bps retained for exit liquidity.`,
  )

  return parts.join(' ')
}
