export interface Baseline {
  vaultValueMeth: bigint
  depositedMeth: bigint
  timestamp: number
}

/**
 * Compute AI-vs-passive-hold delta in basis points.
 * perfDeltaBps = ((vaultValue - baseline) * 10000) / baseline
 */
export function computePerfDelta(vaultValueMeth: bigint, baselineMeth: bigint): number {
  if (baselineMeth === 0n) return 0
  const delta = vaultValueMeth - baselineMeth
  // Scale by 10000 for bps, keep sign
  const bps = (delta * 10_000n) / baselineMeth
  return Number(bps)
}

/**
 * Roll the baseline forward when deposits or withdrawals occur.
 * Adds/subtracts the mETH delta so comparisons stay apples-to-apples.
 */
export function updateBaseline(baseline: Baseline, depositDelta: bigint): Baseline {
  return {
    vaultValueMeth: baseline.vaultValueMeth + depositDelta,
    depositedMeth: baseline.depositedMeth + depositDelta,
    timestamp: baseline.timestamp,
  }
}

export function makeBaseline(vaultValueMeth: bigint): Baseline {
  return {
    vaultValueMeth,
    depositedMeth: vaultValueMeth,
    timestamp: Date.now(),
  }
}
