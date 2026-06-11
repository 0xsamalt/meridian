import { type Address, type Hex } from 'viem'
import { publicClient, walletClient } from './clients.js'
import { mockAavePoolAbi } from './abis.js'
import { env } from '../config.js'

// Deployed MockAavePool on Mantle Sepolia (testnet only)
const MOCK_AAVE_POOL = '0x089Acb3d143a17B5Ae5375E743B140F14A3d1995' as Address

export interface MockSyncResult {
  synced: boolean
  newBps: number
  txHash?: Hex
}

// bps (e.g. 186) → ray-scaled units (1e27) used by Aave/MockAavePool
export function bpsToRay(bps: number): bigint {
  return BigInt(bps) * 10n ** 23n
}

// ray-scaled (1e27) → bps (1e4)
export function rayToBps(ray: bigint): number {
  return Number(ray / 10n ** 23n)
}

export async function syncMockRates(
  aaveRateBps: number,
  enabled = env.MOCK_SYNC_ENABLED,
): Promise<MockSyncResult> {
  if (!enabled) return { synced: false, newBps: aaveRateBps }

  const currentRay = await publicClient.readContract({
    address: MOCK_AAVE_POOL,
    abi: mockAavePoolAbi,
    functionName: 'mockLiquidityRate',
  })
  const currentBps = rayToBps(currentRay)

  // Skip if the rate hasn't moved enough to justify a tx
  if (Math.abs(aaveRateBps - currentBps) < 10) {
    return { synced: false, newBps: currentBps }
  }

  const hash = await walletClient.writeContract({
    address: MOCK_AAVE_POOL,
    abi: mockAavePoolAbi,
    functionName: 'setLiquidityRate',
    args: [bpsToRay(aaveRateBps)],
  })
  await publicClient.waitForTransactionReceipt({ hash })

  return { synced: true, newBps: aaveRateBps, txHash: hash }
}
