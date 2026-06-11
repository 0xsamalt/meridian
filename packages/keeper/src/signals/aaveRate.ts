import { createPublicClient, http } from 'viem'
import { SignalCache } from './cache.js'
import { env } from '../config.js'

// Mantle mainnet Aave V3 addresses (for direct RPC fallback)
const AAVE_MANTLE_POOL = '0x458F293454fE0d67EC0655f3672301301DD51422' as const
const WETH_MANTLE = '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111' as const

// Aave V3 Pool.getReserveData returns DataTypes.ReserveData as a tuple.
// currentLiquidityRate (ray, 1e27) is the 3rd field (index 2).
const aavePoolReserveDataAbi = [
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configuration', type: 'uint256' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'currentLiquidityRate', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'currentVariableBorrowRate', type: 'uint128' },
          { name: 'currentStableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'id', type: 'uint16' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'unbacked', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
      },
    ],
  },
] as const

export let aaveRateCache = new SignalCache<number>()

let mainnetClient: ReturnType<typeof createPublicClient> | null = null
function getMainnetClient() {
  if (!mainnetClient && env.AAVE_MAINNET_RPC) {
    mainnetClient = createPublicClient({ transport: http(env.AAVE_MAINNET_RPC) })
  }
  return mainnetClient
}

// Attempt to parse Aavescan reserve-history response into supply APY bps.
function parseAavescanData(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  const items: unknown[] = Array.isArray(obj.data) ? obj.data : Array.isArray(data) ? (data as unknown[]) : []
  if (items.length === 0) return null

  const latest = items[0] as Record<string, unknown>
  if (typeof latest.supplyApy === 'number') return Math.round(latest.supplyApy * 10_000)
  if (typeof latest.supplyApy === 'string') return Math.round(Number(latest.supplyApy) * 10_000)
  if (typeof latest.liquidityRate === 'string') {
    try {
      return Number(BigInt(latest.liquidityRate) / 10n ** 23n)
    } catch {
      return null
    }
  }
  return null
}

async function fetchFromAavescan(): Promise<number> {
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), 8_000)
  try {
    const res = await fetch(
      'https://aavescan.com/api/mantle-v3/reserve-history?asset=weth',
      { signal: ac.signal },
    )
    if (!res.ok) throw new Error(`Aavescan HTTP ${res.status}`)
    const data: unknown = await res.json()
    const bps = parseAavescanData(data)
    if (bps === null) throw new Error('Could not parse Aavescan response shape')
    return bps
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchFromRpc(): Promise<number> {
  const client = getMainnetClient()
  if (!client) throw new Error('AAVE_MAINNET_RPC not configured — cannot use RPC fallback')
  const data = await client.readContract({
    address: AAVE_MANTLE_POOL,
    abi: aavePoolReserveDataAbi,
    functionName: 'getReserveData',
    args: [WETH_MANTLE],
  })
  // currentLiquidityRate is ray (1e27); convert to bps (1e4): divide by 1e23
  return Number(data.currentLiquidityRate / 10n ** 23n)
}

export async function fetchAaveWethSupplyRateBps(): Promise<number> {
  try {
    const bps = await fetchFromAavescan()
    aaveRateCache = aaveRateCache.update(bps)
    return bps
  } catch {
    // Primary failed — try direct RPC fallback
    try {
      const bps = await fetchFromRpc()
      aaveRateCache = aaveRateCache.update(bps)
      return bps
    } catch {
      const cached = aaveRateCache.get()
      if (cached !== null) return cached
      throw new Error('Failed to fetch Aave WETH supply rate from Aavescan and RPC; cache is empty')
    }
  }
}
