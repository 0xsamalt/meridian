/**
 * Smoke test — verifies RPC connectivity and ABI correctness.
 * Run with: npm run smoke
 * Requires .env with MANTLE_SEPOLIA_RPC, VAULT_ADDRESS, strategy addresses, and KEEPER_PRIVATE_KEY.
 */
import { readChainState } from './chain/vault.js'

const WEI = 10n ** 18n

function fmt(wei: bigint): string {
  const eth = Number(wei) / Number(WEI)
  return eth.toFixed(6) + ' mETH'
}

async function main() {
  console.log('🔍 Meridian keeper smoke test — reading chain state...\n')

  const state = await readChainState()

  console.log('=== Vault ===')
  console.log(`  totalAssets:  ${fmt(state.totalAssets)}`)
  console.log(`  idleMeth:     ${fmt(state.idleMeth)}`)
  console.log(`  lastRebalance: ${new Date(Number(state.lastRebalance) * 1000).toISOString()}`)
  console.log(`  cooldown:     ${state.cooldownSecs}s\n`)

  console.log('=== Strategies ===')
  for (const s of state.strategies) {
    const apyPct = (Number(s.apyBps) / 100).toFixed(2)
    const maxPct = (Number(s.maxBps) / 100).toFixed(2)
    console.log(`  [${s.key.padEnd(6)}] ${s.address}`)
    console.log(`    balance: ${fmt(s.balanceMeth)}  APY: ${apyPct}%  maxBps: ${s.maxBps} (${maxPct}%)`)
  }

  console.log('\n✅ Smoke test passed — chain state read successfully')
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err)
  process.exit(1)
})
