import { z } from 'zod'
import { env } from '../config.js'

// Mantle mainnet token addresses — Nansen tracks chain-level holder behaviour,
// not per-deployment contracts. Query mainnet addresses regardless of which
// chain the vault is deployed on (testnet/mainnet).
export const NANSEN_TOKENS = [
  '0xcDA86A272531e8640cD7F1a92c01839711B90bb0', // mETH mainnet
  '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', // WETH mainnet
  '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', // USDC mainnet
]

// Maps lowercase address → canonical signal key (symbol)
const ADDRESS_TO_SYMBOL: Record<string, string> = {
  '0xcda86a272531e8640cd7f1a92c01839711b90bb0': 'mETH',
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111': 'WETH',
  '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9': 'USDC',
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
