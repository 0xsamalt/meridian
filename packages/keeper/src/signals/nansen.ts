import { z } from 'zod'
import { env } from '../config.js'

// Mantle mainnet token symbols — Nansen tracks chain-level holder behaviour.
// We filter the response by these symbols (case-insensitive match on token_symbol).
const TARGET_SYMBOLS = new Set(['meth', 'weth', 'usdc', 'mnt'])

// Canonical output keys
const SYMBOL_MAP: Record<string, string> = {
  meth: 'mETH',
  weth: 'WETH',
  usdc: 'USDC',
  mnt: 'MNT',
}

const NansenItemSchema = z.object({
  token_symbol: z.string().optional(),
  net_flow_24h_usd: z.number().optional(),
})

const NansenResponseSchema = z
  .object({
    data: z.array(NansenItemSchema).optional(),
    result: z.array(NansenItemSchema).optional(),
  })
  .transform(r => r.data ?? r.result ?? [])

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch 24h smart-money netflows from Nansen for Mantle chain tokens.
 * Returns Record<symbol, netflowUsd>.
 * Throws on network error, non-200, or schema mismatch — caller handles stale.
 */
export async function nansenNetflows(_tokens: string[]): Promise<Record<string, number>> {
  const res = await fetchWithTimeout(
    'https://api.nansen.ai/api/v1/smart-money/netflow',
    {
      method: 'POST',
      headers: {
        apikey: env.NANSEN_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ chains: ['mantle'] }),
    },
    8_000,
  )

  if (!res.ok) {
    throw new Error(`Nansen HTTP ${res.status}: ${res.statusText}`)
  }

  const raw = await res.json() as unknown
  const items = NansenResponseSchema.parse(raw)

  const result: Record<string, number> = {}
  for (const item of items) {
    const sym = (item.token_symbol ?? '').toLowerCase()
    if (!TARGET_SYMBOLS.has(sym)) continue
    const canonical = SYMBOL_MAP[sym]
    if (canonical === undefined) continue
    result[canonical] = item.net_flow_24h_usd ?? 0
  }

  return result
}
