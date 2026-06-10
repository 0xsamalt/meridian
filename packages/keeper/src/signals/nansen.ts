import { z } from 'zod'
import { env } from '../config.js'

// Token addresses on Mantle Sepolia (testnet mocks)
export const NANSEN_TOKENS = [
  '0x9EF6f9160Ba00B6621e5CB3217BB8b54a92B2828', // mETH (testnet)
  '0xfeA27e3b93fb1c8A4965168Cf1BbDe0492a60987', // MockWETH
  '0x892C44ebd6f6f112Ce9C615BDB3E7102d41e08cd', // MockUSDC
]

// Maps lowercase address → canonical signal key (symbol)
const ADDRESS_TO_SYMBOL: Record<string, string> = {
  '0x9ef6f9160ba00b6621e5cb3217bb8b54a92b2828': 'mETH',
  '0xfea27e3b93fb1c8a4965168cf1bbde0492a60987': 'WETH',
  '0x892c44ebd6f6f112ce9c615bdb3e7102d41e08cd': 'USDC',
}

const NansenItemSchema = z.object({
  tokenAddress: z.string().optional(),
  token_address: z.string().optional(),
  netflowUsd: z.number().optional(),
  netflow_usd: z.number().optional(),
  netflow: z.number().optional(),
})

const NansenResponseSchema = z
  .object({
    result: z.array(NansenItemSchema).optional(),
    data: z.array(NansenItemSchema).optional(),
  })
  .transform(r => r.result ?? r.data ?? [])

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
 * Fetch 24h smart-money netflows from Nansen for the given token addresses.
 * Returns Record<symbol, netflowUsd>.
 * Throws on network error, non-200, or schema mismatch — caller handles stale.
 */
export async function nansenNetflows(tokens: string[]): Promise<Record<string, number>> {
  const res = await fetchWithTimeout(
    'https://api.nansen.ai/api/v1/smart-money/netflows',
    {
      method: 'POST',
      headers: {
        apikey: env.NANSEN_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ chain: 'mantle', tokenAddresses: tokens, timeframe: '1d' }),
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
    const addr = (item.tokenAddress ?? item.token_address ?? '').toLowerCase()
    const symbol = ADDRESS_TO_SYMBOL[addr]
    if (symbol === undefined) continue
    result[symbol] = item.netflowUsd ?? item.netflow_usd ?? item.netflow ?? 0
  }

  return result
}
