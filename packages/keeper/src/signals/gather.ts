import { SignalCache, MAX_CACHE_AGE } from './cache.js'
import { nansenNetflows, NANSEN_TOKENS } from './nansen.js'
import { elfaSentiment, ELFA_SYMBOLS } from './elfa.js'
import type { Signals } from '../engine/types.js'

export interface GatherCaches {
  nansen: SignalCache<Record<string, number>>
  elfa: SignalCache<Record<string, number | null>>
}

export function makeDefaultCaches(): GatherCaches {
  return {
    nansen: new SignalCache<Record<string, number>>(),
    elfa: new SignalCache<Record<string, number | null>>(),
  }
}

async function safeFetch<T>(fn: () => Promise<T>): Promise<{ value: T | null; failed: boolean }> {
  try {
    return { value: await fn(), failed: false }
  } catch {
    return { value: null, failed: true }
  }
}

/**
 * Fetch fresh signals; fall back to cached values on failure.
 * Sets stale flags per KEEPER.md §3.3 — never fails open.
 * Returns both signals and updated (immutable) caches.
 */
export async function gatherSignals(caches: GatherCaches): Promise<{
  signals: Signals
  caches: GatherCaches
}> {
  const [nansenResult, elfaResult] = await Promise.all([
    safeFetch(() => nansenNetflows(NANSEN_TOKENS)),
    safeFetch(() => elfaSentiment(ELFA_SYMBOLS)),
  ])

  let nansenCache = caches.nansen
  let elfaCache = caches.elfa

  if (nansenResult.value !== null) nansenCache = nansenCache.update(nansenResult.value)
  if (elfaResult.value !== null) elfaCache = elfaCache.update(elfaResult.value)

  const nansenStale = nansenResult.failed && nansenCache.isStale(MAX_CACHE_AGE)
  const elfaStale = elfaResult.failed && elfaCache.isStale(MAX_CACHE_AGE)

  return {
    signals: {
      smartMoneyNetflowUsd: nansenResult.value ?? nansenCache.get() ?? {},
      sentiment: elfaResult.value ?? elfaCache.get() ?? {},
      nansenStale,
      elfaStale,
    },
    caches: { nansen: nansenCache, elfa: elfaCache },
  }
}
