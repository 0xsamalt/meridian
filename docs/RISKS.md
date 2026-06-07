# Meridian — Risk Architecture & Threat Model

Severity = impact if it fires. Likelihood = chance over the hackathon + early-mainnet
window. Each risk has a **specific** mitigation with code patterns, mapped to the
contracts/keeper modules that implement it.

| # | Risk | Severity | Likelihood | Net priority |
|---|---|---|---|---|
| 1 | Keeper key compromise | Critical | Medium | **P0** |
| 2 | Price-quote manipulation (`getBalance`/swap) | Critical | Medium | **P0** |
| 3 | Reentrancy on vault withdraw | Critical | Low | **P0** |
| 4 | mETH / WETH depeg | High | Low–Med | **P1** |
| 5 | Aave market pause / illiquidity on Mantle | High | Low | **P1** |
| 6 | Stale / wrong price data | High | Medium | **P1** |
| 7 | Elfa/Nansen API downtime | Medium | High | **P1** |
| 8 | USDY mainnet unavailability | Medium | High (known) | **P1** |
| 9 | ERC-4626 first-depositor inflation | High | Low | **P2** |
| 10 | Rebalance front-running / sandwich | Medium | Medium | **P2** |
| 11 | cmETH testnet address stale/wrong | Medium | High (known) | **P2** |
| 12 | ERC-8004 registry addr unverified | Low | Medium | **P3** |

---

## 1. Keeper private key compromise — P0

**Threat:** attacker steals `KEEPER_PRIVATE_KEY` and calls `rebalance` maliciously, or
spams to grief.

**Why it's survivable by design:** the keeper has **no custody path**. Its only powers
are `rebalance` (capped + cooldown) and `recordDecision`. It can never move funds to an
external address.

**Mitigations (defense in depth):**
1. **Hardcoded per-strategy caps** — even a fully malicious rebalance can only shuffle
   funds *between whitelisted strategies* within `maxAllocationBps`. Funds stay in the
   vault/strategies.
   ```solidity
   if (targetBps[i] > maxAllocationBps[strats[i]]) revert CapExceeded(...);
   ```
2. **Cooldown** caps griefing frequency to once/hour:
   ```solidity
   if (block.timestamp < lastRebalance + cooldown) revert CooldownActive(...);
   ```
3. **Role separation** — keeper ≠ guardian ≠ admin. A stolen keeper key cannot add
   strategies, change caps, or unpause.
4. **Instant revocation** without redeploy:
   ```solidity
   vault.revokeRole(KEEPER_ROLE, compromised);
   vault.grantRole(KEEPER_ROLE, fresh);   // admin multisig
   ```
5. **Guardian pause** halts all rebalances immediately on detection.
6. **Secret hygiene** — key in Railway secret store, never in image/repo; low-privilege
   deploy; alerting on every rebalance so anomalies surface in minutes.
7. **Roadmap:** migrate trigger to **Gelato/Chainlink Automation** → no hot key holds
   even capped powers; the network calls a permissioned function with on-chain conditions.

---

## 2. Price-quote manipulation — P0

**Threat:** `getBalance()` and swap-sizing both depend on `_quote(tokenIn, tokenOut)`. If
that reads **spot price** (`slot0`) from a low-liquidity Agni pool, an attacker can:
- inflate `getBalance` → inflate `totalAssets` → mint cheap shares / drain on redeem;
- force bad `minOut` on swaps → sandwich the strategy.

**This is the most dangerous surface in Meridian** (the mETH/WETH and mETH/USDC pools
are not deep).

**Mitigation — TWAP + deviation band + caps (`PriceLib`):**
```solidity
library PriceLib {
    uint32 constant TWAP_WINDOW = 1800;       // 30-min time-weighted price
    uint256 constant MAX_DEVIATION_BPS = 200; // 2% band vs reference

    function twapQuote(address tokenIn, address tokenOut, uint256 amountIn)
        internal view returns (uint256 out)
    {
        uint256 twap = _consultTwap(tokenIn, tokenOut, TWAP_WINDOW); // Agni/UniV3 oracle observe()
        uint256 ref  = _referenceRate(tokenIn, tokenOut);            // Chainlink/Tellor or near-parity assumption
        // reject if TWAP deviates from reference beyond band → blocks manipulated pools
        require(_within(twap, ref, MAX_DEVIATION_BPS), "price deviation");
        out = (amountIn * twap) / 1e18;
    }
}
```
- **Never `slot0`.** Use the pool's TWAP oracle (`observe`), which is costly to
  manipulate over a 30-min window.
- **Cross-check** against an independent reference (Chainlink ETH feed; mETH≈ETH band).
  Revert on divergence — better to skip a rebalance than misprice the vault.
- **Sanity bands** on conversions: mETH/WETH must stay within e.g. 0.95–1.10; outside →
  revert (likely depeg or manipulation, see §4).
- **Withdrawals degrade gracefully:** `_ensureLiquidity` pulls only what's needed and
  `super.withdraw` reverts on shortfall, so a mispriced quote can't silently short a user.

---

## 3. Reentrancy on vault withdraw — P0

**Threat:** a malicious/buggy strategy re-enters `withdraw`/`rebalance` during
`_ensureLiquidity` to manipulate share accounting.

**Mitigation:**
- `nonReentrant` on `deposit/mint/withdraw/redeem/rebalance` (vault) and
  `deploy/withdraw/withdrawAll` (every strategy).
- **Strategy whitelist** — only admin-added, code-reviewed strategies are ever called.
  No arbitrary external contract enters the flow.
- **Checks-effects-interactions** in `_ensureLiquidity` (read balances, then external
  calls; share burn via OZ `super.withdraw` after liquidity is in hand).
- Foundry test: a `ReentrantStrategy` mock that attempts re-entry must revert.

---

## 4. mETH / WETH depeg — P1

**Threat:** the `AaveStrategy` holds WETH (not mETH). If mETH depegs from ETH, swapping
back mETH→WETH→mETH realizes loss; `getBalance` (WETH→mETH) misvalues the sleeve.

**Mitigations:**
- **Deviation band** in `PriceLib` reverts conversions outside 0.95–1.10 — a real depeg
  freezes new deploys into Aave rather than locking in losses.
- **Guardian playbook:** on depeg, `emergencyPause(true)` pulls funds to idle (held as
  mETH), stopping further swap exposure.
- **Cap discipline:** `AaveStrategy` capped (≤60%) so peg exposure is bounded; cmETH
  (no swap, native mETH value) is the safe anchor.
- **Honest framing:** the swap hop is disclosed as the price of using Aave with a
  non-listed asset — a known, bounded risk, not a hidden one.

---

## 5. Aave market pause / illiquidity — P1

**Threat:** Aave governance pauses the WETH reserve or utilization spikes so
`pool.withdraw` can't fully service a withdrawal.

**Mitigations:**
- **Idle buffer** (`idleFloorBps`, default 3%) absorbs routine withdrawals without
  touching Aave.
- **try/catch in `emergencyPause`** so a stuck Aave strategy never blocks rescuing
  cmETH/USDY sleeves.
- **Partial-withdraw tolerance:** `_ensureLiquidity` takes what each strategy can return
  and moves on; user can retry remainder. No assumption that any single venue is fully
  liquid on demand.
- **APY read is view-only** (`getReserveData`) — a paused market reporting 0 simply makes
  the engine allocate away from Aave next cycle.

---

## 6. Stale / wrong price data — P1

**Threat:** oracle/TWAP returns stale data → mispriced vault.

**Mitigations:**
- TWAP `observe` over 30 min (inherently recent); reference cross-check (§2).
- If reference feed is stale/unavailable → `PriceLib` reverts → rebalance skipped
  (fail-safe).
- Keeper marks signal sources stale after 1h and enters **defensive mode** (KEEPER §2.1)
  — never trades on stale inputs.

---

## 7. Elfa / Nansen API downtime — P1

**Threat:** signal APIs down at rebalance time → bad or no decision; demo-day failure.

**Mitigations (KEEPER §3.3):**
- **Cache last-good** (< 1h) and use it; beyond 1h → mark stale.
- **Defensive mode** when stale: pure risk-adjusted-yield split, larger idle buffer, or
  hold current allocation — **never** rebalance on empty data (fail-safe, not fail-open).
- **Elfa is secondary** (30% of tilt) and null-safe, so its (likely) sparse Mantle
  coverage can't break the bot; **Nansen** (confirmed Mantle support) is primary.
- **Demo resilience:** the fallback is a *feature* to show judges — "the agent refuses to
  act on bad data."

---

## 8. USDY mainnet unavailability — P1 (known limitation)

**Threat:** USDY has no DEX liquidity and KYC-gated mint/redeem → the USDY sleeve cannot
run with real USDY on mainnet today.

**Mitigations / plan:**
- **Testnet:** full `UsdyStrategy` runs against **MockUSDY** — complete, demoable flow.
- **Mainnet:** keep `UsdyStrategy` whitelisted but **`maxAllocationBps = 0`** until an
  Ondo integration exists; the vault runs on cmETH + Aave meanwhile (no broken promises
  on-chain).
- **Grant ask = the fix:** "fund an Ondo USDY integration / KYC-gated RWA module" is a
  concrete, fundable roadmap item — turns a limitation into the EcoFund narrative.
- **Optional pivot:** if a live RWA sleeve is needed pre-grant, swap MockUSDY for
  **sUSDe** (real liquidity, live Aave reserve) behind the same `IStrategy` interface —
  zero vault changes.

---

## 9. ERC-4626 first-depositor inflation attack — P2

**Threat:** attacker front-runs first deposit, donates assets to inflate share price,
steals subsequent depositors' value.

**Mitigation:**
- OZ v5 **virtual shares/assets** via `_decimalsOffset() = 6` (already in `VaultCore`).
- **Seed deposit** at deploy (team deposits a small mETH amount and locks the shares) so
  the vault is never empty for a public depositor.
- Foundry test reproducing the classic attack must fail to profit.

---

## 10. Rebalance front-running / sandwich — P2

**Threat:** searchers see a pending `rebalance` and sandwich its swaps.

**Mitigations:**
- **`amountOutMinimum`** on every swap (`_quote * (1 - slippageBps)`) — bounds extractable
  value per swap.
- **TWAP-based sizing** (§2) makes spot manipulation around the tx unprofitable to value
  accounting.
- **Cooldown + delta gate** mean rebalances are infrequent and small (deltas only), not
  full-vault churn — a thin sandwich target.
- Roadmap: private mempool / Gelato relay submission on mainnet.

---

## 11. cmETH testnet address stale/wrong — P2 (known)

**Threat:** the documented cmETH testnet address is from Aug 2024; may be dead on Sepolia.

**Mitigation:** Sepolia uses **MockCmETH** (CONTRACTS §8) — no dependency on the stale
address. Real cmETH is exercised only on the **mainnet fork**, where the verified
mainnet address (`0xE6829…`) is live. Decouples the demo from uncertain testnet infra.

---

## 12. ERC-8004 registry address unverified — P3

**Threat:** building against an ERC-8004 registry address not yet confirmed on-explorer.

**Mitigations:**
- **Day-5 task:** read the contract on `mantlescan` / `sepolia.mantlescan`, confirm it's
  deployed, verified, and matches the ERC-8004 ABI before calling `register()`.
- `MeridianRegistry.recordDecision` wraps `reputation.giveFeedback` in **try/catch** — if
  the registry misbehaves, the on-chain decision log still records (graceful degrade).
- Fallback: the decision log (timestamp + reasoningHash + cid + perfDelta) lives in
  **our own** `MeridianRegistry`, so the audit trail doesn't depend on ERC-8004 being
  perfect — ERC-8004 is the identity/reputation *bonus*, not the core integrity layer.

---

## Pre-mainnet security checklist

- [ ] Every ✅/⚠️ address eyeballed on mantlescan (ARCHITECTURE §4).
- [ ] `PriceLib` uses TWAP + reference cross-check + deviation band — **no `slot0`**.
- [ ] `nonReentrant` on all vault + strategy entry points; `ReentrantStrategy` test passes.
- [ ] Per-strategy caps set; `Σbps ≤ 10000`; cooldown active; fuzz/invariant tests green.
- [ ] Admin = multisig; keeper key in secret store; guardian pause tested.
- [ ] Seed deposit locked; inflation-attack test fails to profit.
- [ ] USDY sleeve `maxAllocationBps = 0` on mainnet until Ondo integration.
- [ ] Slither + (if time) one external eyeball / audit pass.
- [ ] Coverage ≥ 80% (testing.md); engine fixtures cover stale/cap/spike paths.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system context, [CONTRACTS.md](./CONTRACTS.md)
for the implementations these mitigations live in, and [KEEPER.md](./KEEPER.md) for the
off-chain fail-safe behavior.
