import { describe, it, expect } from 'vitest'
import { computeAllocation } from '../src/engine/allocate.js'
import { DEFAULT_ENGINE_CONFIG } from '../src/engine/types.js'
import type { StrategySnapshot, Signals } from '../src/engine/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStrategy(
  key: 'cmeth' | 'aave' | 'usdy',
  apyBps: number,
  maxBps = 7000,
): StrategySnapshot {
  return {
    key,
    address: `0x${'0'.repeat(40)}` as `0x${string}`,
    apyBps,
    balanceMeth: 0n,
    maxBps,
    liquidityUsd: 50_000_000,
    protocolRiskScore: DEFAULT_ENGINE_CONFIG.protocolRisk[key] ?? 0.2,
  }
}

const BASE_STRATEGIES: StrategySnapshot[] = [
  makeStrategy('cmeth', 350),
  makeStrategy('aave', 280),
  makeStrategy('usdy', 500),
]

const freshSignals: Signals = {
  smartMoneyNetflowUsd: { mETH: 100_000, WETH: -50_000, USDC: 80_000 },
  sentiment: { mETH: 0.3, WETH: 0.1, USDC: 0.2 },
  nansenStale: false,
  elfaStale: false,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('graceful signal degrade', () => {
  it('stale nansen only → normal mode (elfa still covers)', () => {
    const signals: Signals = { ...freshSignals, nansenStale: true, elfaStale: false }
    const result = computeAllocation(BASE_STRATEGIES, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('normal')
    // Rationale mentions Nansen is stale
    expect(result.rationale).toMatch(/nansen/i)
  })

  it('stale elfa only → normal mode (nansen still covers)', () => {
    const signals: Signals = { ...freshSignals, nansenStale: false, elfaStale: true }
    const result = computeAllocation(BASE_STRATEGIES, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('normal')
    expect(result.rationale).toMatch(/elfa/i)
  })

  it('both stale → defensive mode', () => {
    const signals: Signals = {
      smartMoneyNetflowUsd: {},
      sentiment: {},
      nansenStale: true,
      elfaStale: true,
    }
    const result = computeAllocation(BASE_STRATEGIES, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('defensive')
    expect(result.rationale).toMatch(/defensive/i)
  })

  it('null elfa sentiment treated as 0 tilt (no crash, normal mode)', () => {
    const signals: Signals = {
      smartMoneyNetflowUsd: { mETH: 0, WETH: 0, USDC: 0 },
      sentiment: { mETH: null, WETH: null, USDC: null },
      nansenStale: false,
      elfaStale: false,
    }
    // Must not throw
    const result = computeAllocation(BASE_STRATEGIES, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('normal')
    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
  })

  it('both stale: defensive allocation respects per-strategy caps', () => {
    const strategies: StrategySnapshot[] = [
      makeStrategy('cmeth', 350, 2000), // cap at 20% — well below defensive 50%
      makeStrategy('aave', 280, 7000),
      makeStrategy('usdy', 500, 7000),
    ]
    const signals: Signals = {
      smartMoneyNetflowUsd: {},
      sentiment: {},
      nansenStale: true,
      elfaStale: true,
    }
    const result = computeAllocation(strategies, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.mode).toBe('defensive')
    expect(result.targetBps['cmeth']).toBeLessThanOrEqual(2000)

    const total = Object.values(result.targetBps).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
  })

  it('defensive mode: idle is at least idleFloorBps', () => {
    const signals: Signals = {
      smartMoneyNetflowUsd: {},
      sentiment: {},
      nansenStale: true,
      elfaStale: true,
    }
    const result = computeAllocation(BASE_STRATEGIES, signals, DEFAULT_ENGINE_CONFIG)

    expect(result.targetBps['idle']).toBeGreaterThanOrEqual(DEFAULT_ENGINE_CONFIG.idleFloorBps)
  })
})
