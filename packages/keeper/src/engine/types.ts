export type StrategyKey = 'cmeth' | 'aave' | 'usdy'

export interface StrategySnapshot {
  key: StrategyKey
  address: `0x${string}`
  apyBps: number
  balanceMeth: bigint
  maxBps: number
  liquidityUsd: number
  protocolRiskScore: number
}

export interface Signals {
  smartMoneyNetflowUsd: Record<string, number>
  sentiment: Record<string, number | null>
  nansenStale: boolean
  elfaStale: boolean
}

export interface AllocationResult {
  targetBps: Record<string, number>
  scores: Record<string, number>
  rationale: string
  mode: 'normal' | 'defensive'
}

export interface EngineConfig {
  riskWeight: number
  signalWeight: number
  maxTilt: number
  idleFloorBps: number
  minRebalanceDeltaBps: number
  protocolRisk: Record<string, number>
  liquidityUsd: Record<string, number>
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  riskWeight: 20,
  signalWeight: 0.25,
  maxTilt: 0.25,
  idleFloorBps: 300,
  minRebalanceDeltaBps: 300,
  protocolRisk: { cmeth: 0.15, aave: 0.10, usdy: 0.20 },
  liquidityUsd: { cmeth: 50_000_000, aave: 100_000_000, usdy: 5_000_000 },
}
