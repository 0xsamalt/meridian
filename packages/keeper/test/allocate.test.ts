import { describe, it, expect } from 'vitest'
import { computeAllocation } from '../src/engine/allocate.js'
import { DEFAULT_ENGINE_CONFIG } from '../src/engine/types.js'
import type { StrategySnapshot, Signals, EngineConfig } from '../src/engine/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStrategy(
  key: 'cmeth' | 'aave' | 'usdy',
  apyBps: number,
  maxBps = 7000,
  liquidityUsd = 50_000_000,
  protocolRiskScore?: number,
): StrategySnapshot {
  return {
    key,
    address: `0x${'0'.repeat(40)}` as `0x${string}`,
    apyBps,
    balanceMeth: 0n,
    maxBps,
    liquidityUsd,
    protocolRiskScore: protocolRiskScore ?? DEFAULT_ENGINE_CONFIG.protocolRisk[key] ?? 0.2,
  }
}

const freshSignals: Signals = {
  smartMoneyNetflowUsd: { mETH: 0, WETH: 0, USDC: 0 },
  sentiment: { mETH: 0, WETH: 0, USDC: 0 },
  nansenStale: false,
  elfaStale: false,
}

const BASE_STRATEGIES: StrategySnapshot[] = [
  makeStrategy('cmeth', 350),
  makeStrategy('aave', 280),
  makeStrategy('usdy', 500),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeAllocation', () => {
  it('normal mode: high-APY strategy gets highest allocation', () => {
    const result = computeAllocation(BASE_STRATEGIES, freshSignals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('normal')
    // USDY has 500bps APY — should get the most bps
    const bps = result.targetBps
    expect(bps['usdy']).toBeGreaterThan(bps['cmeth']!)
    expect(bps['usdy']).toBeGreaterThan(bps['aave']!)
  })

  it('cap binding: strategy clamped at maxBps even with overwhelming score', () => {
    const strategies: StrategySnapshot[] = [
      makeStrategy('cmeth', 10000, 3000), // would dominate but capped at 30%
      makeStrategy('aave', 100, 6000),
      makeStrategy('usdy', 100, 7000),
    ]
    const result = computeAllocation(strategies, freshSignals, DEFAULT_ENGINE_CONFIG)

    expect(result.targetBps['cmeth']).toBeLessThanOrEqual(3000)
    expect(result.mode).toBe('normal')
  })

  it('idle floor: strategy total never exceeds 10000 - idleFloorBps', () => {
    const result = computeAllocation(BASE_STRATEGIES, freshSignals, DEFAULT_ENGINE_CONFIG)

    const stratTotal = Object.entries(result.targetBps)
      .filter(([k]) => k !== 'idle')
      .reduce((s, [, v]) => s + v, 0)

    expect(stratTotal).toBeLessThanOrEqual(10_000 - DEFAULT_ENGINE_CONFIG.idleFloorBps)
  })

  it('bps invariant: sum of all targetBps (incl idle) always equals 10000', () => {
    const result = computeAllocation(BASE_STRATEGIES, freshSignals, DEFAULT_ENGINE_CONFIG)
    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
  })

  it('signal tilt: positive netflow nudges allocation up (bounded)', () => {
    const neutral = computeAllocation(BASE_STRATEGIES, freshSignals, DEFAULT_ENGINE_CONFIG)

    const bullishSignals: Signals = {
      ...freshSignals,
      smartMoneyNetflowUsd: { mETH: 5_000_000, WETH: 0, USDC: 0 }, // big inflow to mETH
    }
    const bullish = computeAllocation(BASE_STRATEGIES, bullishSignals, DEFAULT_ENGINE_CONFIG)

    // cmeth maps to mETH signal — should get more bps with positive inflow
    expect(bullish.targetBps['cmeth']).toBeGreaterThanOrEqual(neutral.targetBps['cmeth']!)
  })

  it('negative netflow: nudges allocation down (bounded, never below 0)', () => {
    const bearishSignals: Signals = {
      ...freshSignals,
      smartMoneyNetflowUsd: { mETH: -5_000_000, WETH: 0, USDC: 0 },
    }
    const result = computeAllocation(BASE_STRATEGIES, bearishSignals, DEFAULT_ENGINE_CONFIG)

    // All bps values non-negative
    for (const [, v] of Object.entries(result.targetBps)) {
      expect(v).toBeGreaterThanOrEqual(0)
    }
    // cmeth score should be <= neutral case
    const neutral = computeAllocation(BASE_STRATEGIES, freshSignals, DEFAULT_ENGINE_CONFIG)
    expect(result.targetBps['cmeth']).toBeLessThanOrEqual(neutral.targetBps['cmeth']!)
  })

  it('renormalize: redistributes clipped weight to uncapped strategies', () => {
    const strategies: StrategySnapshot[] = [
      makeStrategy('cmeth', 9000, 2000), // heavily capped: excess must flow to others
      makeStrategy('aave', 200, 6000),
      makeStrategy('usdy', 200, 7000),
    ]
    const result = computeAllocation(strategies, freshSignals, DEFAULT_ENGINE_CONFIG)

    expect(result.targetBps['cmeth']).toBeLessThanOrEqual(2000)

    // aave + usdy must absorb the overflow
    const aavePlusUsdy = (result.targetBps['aave'] ?? 0) + (result.targetBps['usdy'] ?? 0)
    expect(aavePlusUsdy).toBeGreaterThan(2000)

    // invariant still holds
    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
  })

  it('bps invariant holds when all strategies are at their caps', () => {
    const strategies: StrategySnapshot[] = [
      makeStrategy('cmeth', 9000, 1000),
      makeStrategy('aave', 9000, 1000),
      makeStrategy('usdy', 9000, 1000),
    ]
    const result = computeAllocation(strategies, freshSignals, DEFAULT_ENGINE_CONFIG)

    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)

    for (const [k, v] of Object.entries(result.targetBps)) {
      if (k !== 'idle') expect(v).toBeLessThanOrEqual(1000)
    }
  })

  it('config with custom idleFloorBps enforces the correct idle amount', () => {
    const config: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, idleFloorBps: 1000 }
    const result = computeAllocation(BASE_STRATEGIES, freshSignals, config)

    expect(result.targetBps['idle']).toBeGreaterThanOrEqual(1000)
    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
  })
})
