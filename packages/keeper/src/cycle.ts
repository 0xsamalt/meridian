import type { Logger } from 'pino'
import type { Address, Hex } from 'viem'
import { readChainState, simulateRebalance, submitRebalance } from './chain/vault.js'
import { recordDecision } from './chain/registry.js'
import { gatherSignals, makeDefaultCaches } from './signals/gather.js'
import type { GatherCaches } from './signals/gather.js'
import { computeAllocation } from './engine/allocate.js'
import { computePerfDelta, makeBaseline } from './engine/benchmark.js'
import type { Baseline } from './engine/benchmark.js'
import { DEFAULT_ENGINE_CONFIG } from './engine/types.js'
import type { StrategySnapshot, StrategyKey } from './engine/types.js'
import { buildReasoningJson } from './reasoning/build.js'
import { pinReasoning } from './reasoning/ipfs.js'
import { env } from './config.js'

export interface CycleState {
  caches: GatherCaches
  baseline: Baseline | null
}

export interface CycleResult {
  rebalanced: boolean
  skipReason?: string
  rebalanceTxHash?: Hex
  decisionTxHash?: Hex
  cid?: string
  error?: string
}

export function makeInitialCycleState(): CycleState {
  return { caches: makeDefaultCaches(), baseline: null }
}

export async function runCycle(
  state: CycleState,
  log: Logger,
): Promise<{ result: CycleResult; state: CycleState }> {
  let newCaches = state.caches

  try {
    // Step 1: read chain state
    log.info('Step 1: reading chain state')
    const chainState = await readChainState()
    log.info(
      { totalAssets: chainState.totalAssets.toString(), strategies: chainState.strategies.length },
      'chain state read',
    )

    // Initialise baseline on first cycle
    let baseline = state.baseline
    if (baseline === null) {
      baseline = makeBaseline(chainState.totalAssets)
      log.info('baseline initialised')
    }

    // Step 2: gather signals
    log.info('Step 2: gathering signals')
    const { signals, caches } = await gatherSignals(state.caches)
    newCaches = caches
    log.info({ nansenStale: signals.nansenStale, elfaStale: signals.elfaStale }, 'signals gathered')

    // Step 3: compute allocation
    log.info('Step 3: computing allocation')
    const snapshots: StrategySnapshot[] = chainState.strategies.map((s) => ({
      key: s.key as StrategyKey,
      address: s.address,
      apyBps: Number(s.apyBps),
      balanceMeth: s.balanceMeth,
      maxBps: Number(s.maxBps),
      liquidityUsd: DEFAULT_ENGINE_CONFIG.liquidityUsd[s.key] ?? 0,
      protocolRiskScore: DEFAULT_ENGINE_CONFIG.protocolRisk[s.key] ?? 0.2,
    }))
    const allocation = computeAllocation(snapshots, signals, DEFAULT_ENGINE_CONFIG)
    log.info({ mode: allocation.mode, targetBps: allocation.targetBps }, 'allocation computed')

    // Step 4: check rebalance conditions
    log.info('Step 4: checking rebalance conditions')
    const nowSecs = BigInt(Math.floor(Date.now() / 1000))
    const cooldownEndsAt = chainState.lastRebalance + chainState.cooldownSecs

    if (nowSecs < cooldownEndsAt) {
      const waitSecs = Number(cooldownEndsAt - nowSecs)
      const skipReason = `cooldown active — ${waitSecs}s remaining`
      log.info(skipReason)
      return { result: { rebalanced: false, skipReason }, state: { caches: newCaches, baseline } }
    }

    // Skip if no strategy moves enough
    let maxDelta = 0
    const totalAssets = chainState.totalAssets
    if (totalAssets > 0n) {
      for (const s of chainState.strategies) {
        const currentBps = Number((s.balanceMeth * 10_000n) / totalAssets)
        const targetBps = allocation.targetBps[s.key] ?? 0
        maxDelta = Math.max(maxDelta, Math.abs(targetBps - currentBps))
      }
    }

    if (maxDelta < env.MIN_REBALANCE_DELTA_BPS) {
      const skipReason = `max delta ${maxDelta}bps < threshold ${env.MIN_REBALANCE_DELTA_BPS}bps`
      log.info(skipReason)
      return { result: { rebalanced: false, skipReason }, state: { caches: newCaches, baseline } }
    }

    // Step 5: build reasoning doc + pin to IPFS
    log.info('Step 5: pinning reasoning to IPFS')
    const perfDeltaBps = computePerfDelta(chainState.totalAssets, baseline.vaultValueMeth)
    const reasoningDoc = buildReasoningJson(chainState, signals, allocation, perfDeltaBps)
    const { cid, reasoningHash } = await pinReasoning(reasoningDoc)
    log.info({ cid }, 'reasoning pinned')

    // Step 6: simulate + submit rebalance
    log.info('Step 6: submitting rebalance')
    const stratAddresses: Address[] = chainState.strategies.map((s) => s.address)
    const targetBpsArray: bigint[] = chainState.strategies.map(
      (s) => BigInt(allocation.targetBps[s.key] ?? 0),
    )
    await simulateRebalance(stratAddresses, targetBpsArray, reasoningHash)
    const rebalanceTxHash = await submitRebalance(stratAddresses, targetBpsArray, reasoningHash)
    log.info({ rebalanceTxHash }, 'rebalance submitted')

    // Step 7: record decision on-chain
    log.info('Step 7: recording decision')
    const decisionTxHash = await recordDecision(
      cid,
      BigInt(perfDeltaBps),
      chainState.totalAssets,
    )
    log.info({ decisionTxHash }, 'decision recorded')

    return {
      result: { rebalanced: true, rebalanceTxHash, decisionTxHash, cid },
      state: { caches: newCaches, baseline: makeBaseline(chainState.totalAssets) },
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error({ err }, 'cycle error')
    return {
      result: { rebalanced: false, error },
      state: { ...state, caches: newCaches },
    }
  }
}
