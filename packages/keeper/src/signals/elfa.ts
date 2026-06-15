import { z } from 'zod'
import { env } from '../config.js'

// Token symbols to query — matched case-insensitively against Elfa's `token` field
export const ELFA_SYMBOLS = ['mETH', 'MNT', 'WETH', 'USDC', 'ETH']

const ElfaItemSchema = z.object({
  token: z.string(),
  current_count: z.number().optional(),
  previous_count: z.number().optional(),
  change_percent: z.number().optional(),
})

// Elfa v2 /aggregations/trending-tokens shape:
// { success: true, data: { total, page, pageSize, data: [...] } }
const ElfaResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .union([
        z.object({ data: z.array(ElfaItemSchema) }),
        z.array(ElfaItemSchema),
      ])
      .optional(),
  })
  .transform(r => {
    if (r.data === undefined) return []
    if (Array.isArray(r.data)) return r.data
    return r.data.data
  })

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Normalize change_percent to [-1, 1] via tanh so extreme values don't dominate
function sentimentFromChangePct(pct: number): number {
  return Math.tanh(pct / 100)
}

/**
 * Fetch social sentiment from Elfa for the given symbols.
 * Returns Record<symbol, sentiment | null>.
 * A null value means Elfa has no data for that symbol — engine treats it as 0 tilt.
 * Throws on network error or fatal schema mismatch — caller handles stale.
 */
export async function elfaSentiment(symbols: string[]): Promise<Record<string, number | null>> {
  const res = await fetchWithTimeout(
    'https://api.elfa.ai/v2/aggregations/trending-tokens?timeWindow=24h',
    {
      method: 'GET',
      headers: { 'x-elfa-api-key': env.ELFA_API_KEY },
    },
    8_000,
  )

  if (!res.ok) {
    throw new Error(`Elfa HTTP ${res.status}: ${res.statusText}`)
  }

  const raw = await res.json() as unknown
  const items = ElfaResponseSchema.parse(raw)

  // Build a lowercase symbol → sentiment map from the response
  const fromApi: Record<string, number | null> = {}
  for (const item of items) {
    const key = item.token.toLowerCase()
    fromApi[key] =
      item.change_percent !== undefined
        ? sentimentFromChangePct(item.change_percent)
        : null
  }

  // Return null for any requested symbol absent from the response
  const result: Record<string, number | null> = {}
  for (const sym of symbols) {
    result[sym] = fromApi[sym.toLowerCase()] ?? null
  }
  return result
}
