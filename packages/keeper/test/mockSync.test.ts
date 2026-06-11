import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports by vitest
// ---------------------------------------------------------------------------
vi.mock('../src/config.js', () => ({
  env: {
    MOCK_SYNC_ENABLED: true,
    MANTLE_SEPOLIA_RPC: 'https://rpc.sepolia.mantle.xyz',
    KEEPER_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    VAULT_ADDRESS: `0x${'0'.repeat(40)}`,
    REGISTRY_ADDRESS: `0x${'0'.repeat(40)}`,
    CMETH_STRATEGY: `0x${'0'.repeat(40)}`,
    AAVE_STRATEGY: `0x${'0'.repeat(40)}`,
    USDY_STRATEGY: `0x${'0'.repeat(40)}`,
    NANSEN_API_KEY: 'test',
    ELFA_API_KEY: 'test',
    PINATA_JWT: 'test',
    ADMIN_SECRET: 'test',
    REBALANCE_INTERVAL_SECONDS: 3600,
    MIN_REBALANCE_DELTA_BPS: 300,
    COOLDOWN_SECONDS: 3600,
    CMETH_APY_OVERRIDE_BPS: 500,
    USDY_APY_OVERRIDE_BPS: 355,
    AAVE_MAINNET_RPC: undefined,
  },
}))

vi.mock('../src/chain/clients.js', () => ({
  publicClient: {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
  walletClient: {
    writeContract: vi.fn(),
    account: { address: `0x${'0'.repeat(40)}` },
  },
}))

// Import after mocks so the hoisted factories are already resolved
import { publicClient, walletClient } from '../src/chain/clients.js'
import { bpsToRay, rayToBps, syncMockRates } from '../src/chain/mockSync.js'

const mockReadContract = vi.mocked(publicClient.readContract)
const mockWriteContract = vi.mocked(walletClient.writeContract)
const mockWaitForReceipt = vi.mocked(publicClient.waitForTransactionReceipt)

// ---------------------------------------------------------------------------
// bpsToRay / rayToBps
// ---------------------------------------------------------------------------
describe('bpsToRay', () => {
  it('converts 186 bps to 1.86e25', () => {
    // 186 * 10^23 = 18_600_000_000_000_000_000_000_000
    expect(bpsToRay(186)).toBe(18_600_000_000_000_000_000_000_000n)
  })

  it('converts 500 bps (5%) correctly', () => {
    expect(bpsToRay(500)).toBe(50_000_000_000_000_000_000_000_000n)
  })

  it('converts 0 bps to 0n', () => {
    expect(bpsToRay(0)).toBe(0n)
  })
})

describe('rayToBps', () => {
  it('roundtrips 186 bps', () => {
    expect(rayToBps(bpsToRay(186))).toBe(186)
  })

  it('truncates fractional bps (floor behaviour)', () => {
    // 186 bps + 5e22 (half a bps) → still 186 after BigInt floor division
    expect(rayToBps(bpsToRay(186) + 5n * 10n ** 22n)).toBe(186)
  })
})

// ---------------------------------------------------------------------------
// syncMockRates
// ---------------------------------------------------------------------------
describe('syncMockRates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWaitForReceipt.mockResolvedValue({})
  })

  it('skips tx when rate change is < 10 bps (delta = 4)', async () => {
    // Current on-chain: 186 bps; new: 190 bps → delta 4 → skip
    mockReadContract.mockResolvedValue(bpsToRay(186))
    const result = await syncMockRates(190)
    expect(result.synced).toBe(false)
    expect(result.newBps).toBe(186) // returns current on-chain bps
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  it('sends tx when rate change is >= 10 bps (delta = 14)', async () => {
    mockReadContract.mockResolvedValue(bpsToRay(186))
    mockWriteContract.mockResolvedValue('0xdeadbeef')
    const result = await syncMockRates(200)
    expect(result.synced).toBe(true)
    expect(result.newBps).toBe(200)
    expect(result.txHash).toBe('0xdeadbeef')
    expect(mockWriteContract).toHaveBeenCalledOnce()
    // Verify the ray value passed to setLiquidityRate is correct
    const callArgs = mockWriteContract.mock.calls[0]?.[0] as { args: unknown[] }
    expect(callArgs.args[0]).toBe(bpsToRay(200))
  })

  it('sends tx on exact 10 bps delta (boundary)', async () => {
    mockReadContract.mockResolvedValue(bpsToRay(190))
    mockWriteContract.mockResolvedValue('0xabc')
    const result = await syncMockRates(200)
    expect(result.synced).toBe(true)
  })

  it('no-ops when enabled=false regardless of delta', async () => {
    const result = await syncMockRates(300, false)
    expect(result.synced).toBe(false)
    expect(result.newBps).toBe(300)
    expect(mockReadContract).not.toHaveBeenCalled()
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  it('handles rate drop (negative delta) correctly', async () => {
    // Current: 892 (Aave spike), new: 186 → delta 706 → should sync
    mockReadContract.mockResolvedValue(bpsToRay(892))
    mockWriteContract.mockResolvedValue('0x123')
    const result = await syncMockRates(186)
    expect(result.synced).toBe(true)
    expect(result.newBps).toBe(186)
  })
})
