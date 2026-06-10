import { z } from 'zod'
import { env } from '../config.js'

// Token symbols to query — Mantle coverage may be sparse; engine handles null gracefully
export const ELFA_SYMBOLS = ['mETH', 'MNT', 'WETH', 'USDC']

const ElfaTokenSchema = z.object({
  token: z.string().optional(),
  symbol: z.string().optional(),
  // Sentiment or mention-based score; various field names across API versions
  sentiment: z.number().optional(),
  sentimentScore: z.number().optional(),
  score: z.number().optional(),
  positiveRatio: z.number().optional(),
})

const ElfaResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .union([
        z.array(ElfaTokenSchema),
        z.object({ data: z.array(ElfaTokenSchema) }),
        z.object({ tokens: z.array(ElfaTokenSchema) }),
      ])
      .optional(),
  })
  .transform(r => {
    if (r.data === undefined) return []
    if (Array.isArray(r.data)) return r.data
    if ('data' in r.data) return r.data.data
    if ('tokens' in r.data) return r.data.tokens
    return []
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

function extractSentiment(item: z.infer<typeof ElfaTokenSchema>): number | null {
  // Prefer explicit sentiment field; fall back to positiveRatio → [-1, 1]
  if (item.sentiment !== undefined) return Math.max(-1, Math.min(1, item.sentiment))
  if (item.sentimentScore !== undefined) return Math.max(-1, Math.min(1, item.sentimentScore))
  if (item.score !== undefined) return Math.max(-1, Math.min(1, item.score))
  if (item.positiveRatio !== undefined) return Math.max(-1, Math.min(1, item.positiveRatio * 2 - 1))
  return null
}

/**
 * Fetch social sentiment from Elfa for the given symbols.
 * Returns Record<symbol, sentiment | null>.
 * A null value means Elfa has no data for that symbol — engine treats it as 0 tilt.
 * Throws on network error or fatal schema mismatch — caller handles stale.
 */
export async function elfaSentiment(symbols: string[]): Promise<Record<string, number | null>> {
  const res = await fetchWithTimeout(
    'https://api.elfa.ai/v2/aggregations/trending-tokens',
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

  // Build a map from symbol → sentiment from the response
  const fromApi: Record<string, number | null> = {}
  for (const item of items) {
    const sym = item.token ?? item.symbol
    if (sym === undefined) continue
    fromApi[sym] = extractSentiment(item)
  }

  // Log raw response once in dev for Elfa coverage debugging
  if (process.env['NODE_ENV'] !== 'test') {
    const keys = Object.keys(fromApi)
    if (keys.length === 0) {
      console.warn('[elfa] Response contained no recognisable tokens — Mantle coverage may be sparse')
    }
  }

  // Return null for any requested symbol absent from the response
  const result: Record<string, number | null> = {}
  for (const sym of symbols) {
    result[sym] = fromApi[sym] ?? null
  }
  return result
}
