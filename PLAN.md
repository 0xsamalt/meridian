# Meridian — Session-by-Session Build Plan

**Deadline:** June 15, 2026 (AI × RWA track, Turing Test 2026 on DoraHacks)
**Status as of Session 8:**

| Layer | Status |
|---|---|
| Contracts (VaultCore, 3 strategies, Registry, 6 mocks) | ✅ Built + tested |
| Deployed to Mantle Sepolia (deployer: 0x640CF727…) | ✅ Live |
| Strategies wired to vault (addStrategy x3) | ✅ Done |
| Keeper — chain layer (viem clients, vault reader, registry) | ✅ Done |
| Keeper — allocation engine + Nansen/Elfa signals + tests | ✅ Done |
| Keeper — cycle, IPFS (Pinata), cron, /trigger, Dockerfile | ✅ Done |
| Frontend — scaffold + deposit/withdraw page (Session 7) | ✅ Done |
| Frontend — dashboard + decisions + IPFS renderer (Session 8) | ✅ Done |
| Keeper — real-world APY feed + Aave rate sync (Session 8b) | ✅ Done |
| Agent registration (ERC-8004 registerAgent) | ✅ Done (agentId 146) |
| Demo / submission | 🔄 In progress |

**Deployed addresses (Mantle Sepolia, chain 5003):**
```
VaultCore:        0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7
CmethStrategy:    0x87Af08833081B09222695133017d25c06eFAa12E
AaveStrategy:     0x22923419faBE7853b3E4fE4fBE2C90EDc21DA090
UsdyStrategy:     0x697b88a6BF3Df8D038b5685833f62646b1F1980a
MeridianRegistry: 0x27796e411769ebf9b365e8534bae3a03c5588cad
MockCmETH:        0x718708c91d2e26E2EE531C4722A684b2D0d9e21e
MockAavePool:     0x089Acb3d143a17B5Ae5375E743B140F14A3d1995
MockSwapRouter:   0xf5b1954Cd83B707F3AB1ef1FA4ED184F0891D1cE
MockWETH:         0xfeA27e3b93fb1c8A4965168Cf1BbDe0492a60987
MockUSDC:         0x892C44ebd6f6f112Ce9C615BDB3E7102d41e08cd
MockUSDY:         0xA37fEFce169dD54F6A778883D18D750A841432Fd
mETH (testnet):   0x9EF6f9160Ba00B6621e5CB3217BB8b54a92B2828
```

**Deployer / Keeper / Guardian wallet:** `0x640CF727cDd96357d7f7B05A46cAb517012A7911`

---

## Session 4 — Keeper: Infrastructure + Chain Layer

**Goal:** Keeper package compiles, reads live chain state from Sepolia, and can
call vault and registry. No signals or engine yet.

**Working directory:** `packages/keeper`

**Tasks:**

1. **Update `package.json`** — add all runtime deps:
   `viem@^2`, `dotenv@^16`, `zod@^3`, `pino@^9`, `pino-pretty@^11`,
   `node-cron@^3`, `express@^4`,
   `@web3-storage/w3up-client @ucanto/principal/ed25519 @ucanto/core/delegation @ipld/car`
   and dev deps: `typescript@^5`, `ts-node@^10`, `@types/node@^20`,
   `@types/express@^4`, `vitest@^1`.

2. **`tsconfig.json`** — target ES2022, module NodeNext, strict true, outDir dist.

3. **`src/config.ts`** — zod-parsed env schema. Required vars:
   `MANTLE_SEPOLIA_RPC`, `KEEPER_PRIVATE_KEY`, `VAULT_ADDRESS`, `REGISTRY_ADDRESS`,
   `CMETH_STRATEGY`, `AAVE_STRATEGY`, `USDY_STRATEGY`,
   `NANSEN_API_KEY`, `ELFA_API_KEY`,
   `STORACHA_AGENT_KEY`, `STORACHA_DELEGATION`,
   `REBALANCE_INTERVAL_SECONDS` (default 3600),
   `MIN_REBALANCE_DELTA_BPS` (default 300),
   `COOLDOWN_SECONDS` (default 3600).
   Export typed `env` singleton. Throw at startup if any required var missing.
   Note: `WEB3_STORAGE_TOKEN` is dead — old web3.storage API tokens were
   deprecated when the platform migrated to Storacha Network (UCAN auth).

4. **`src/chain/clients.ts`** — viem `publicClient` (Mantle Sepolia, chain id 5003)
   and `walletClient` (from `KEEPER_PRIVATE_KEY`). Define the Mantle Sepolia chain
   object inline (name, rpcUrls, nativeCurrency MNT).

5. **`src/chain/abis.ts`** — minimal ABI fragments needed by the keeper:
   - VaultCore: `totalAssets`, `idleAssets`, `strategies`, `lastRebalance`, `cooldown`,
     `rebalance(address[],uint256[],bytes32)`
   - StrategyBase: `getCurrentAPY`, `getBalance`
   - MeridianRegistry: `recordDecision(bytes32,string,int256,uint256)`

6. **`src/chain/vault.ts`** — exports:
   - `readChainState()`: returns `{ totalAssets, idleMeth, lastRebalance, strategies: [{key, address, apyBps, balanceMeth, maxBps}] }`.
     Reads all strategy addresses from vault, then fans out to read `getCurrentAPY` and
     `getBalance` for each. Uses `publicClient.multicall` for efficiency.
   - `submitRebalance(strategies, targetBpsArray, reasoningHash)`: calls
     `vault.rebalance(...)`, waits for receipt, returns txHash.
   - `simulateRebalance(...)`: uses `publicClient.simulateContract` first — if it
     reverts (cooldown / cap), throw with the revert reason so cycle can skip cleanly.

7. **`src/chain/registry.ts`** — exports:
   - `recordDecision(reasoningHash, cid, perfDeltaBps, totalAssets)`: calls
     `registry.recordDecision(...)`, waits for receipt, returns txHash.
   - `getDecisions(fromBlock?)`: reads `DecisionRecorded` events. Returns array of
     `{ index, reasoningHash, cid, perfDeltaBps, timestamp }`.

8. **Update `.env.example`** — fill in all var names from config.ts, with the
   Sepolia contract addresses from `deployments/sepolia.json` as defaults.

9. **Smoke-test script `src/smoke.ts`** — standalone `ts-node` script that calls
   `readChainState()` and prints the result. Used to verify RPC + ABI work before
   building signals. Add `"smoke": "ts-node src/smoke.ts"` to package.json scripts.

**Success criteria:** `npm run smoke` prints totalAssets, idleMeth, and APY/balance
for each of the 3 strategies from live Sepolia. No signals, no engine, no tx yet.

**Commit:** `feat(keeper): chain layer — viem clients, vault reader, registry writer`

---

## Session 5 — Keeper: Allocation Engine + Signals + Tests

**Goal:** The core AI logic is implemented and fully unit-tested. Signals fetch from
Nansen and Elfa (with graceful degrade). Engine is pure and deterministic.

**Working directory:** `packages/keeper`

**Read before coding:**
- `docs/KEEPER.md` sections 2 (Allocation engine algorithm) and 3 (API integration)
- `src/config.ts` (CONFIG defaults) from session 4

**Tasks:**

1. **`src/engine/types.ts`** — TypeScript interfaces:
   `StrategySnapshot`, `Signals`, `AllocationResult`, `EngineConfig`
   (exact shapes from KEEPER.md §2).

2. **`src/engine/allocate.ts`** — `computeAllocation(strategies, signals, config)`:
   - Implements the full scoring algorithm from KEEPER.md §2 pseudocode:
     yieldScore, riskPenalty, liqBonus, signalTilt (bounded ±maxTilt).
   - `normalizeToBps`, `applyCaps`, `renormalize`, `enforceIdleFloor` as
     private helpers.
   - Returns `AllocationResult` with targetBps, scores, rationale string, mode.
   - **Must be a pure function — zero network calls, zero side effects.**

3. **`src/engine/defensive.ts`** — `defensiveAllocation(strategies, config)`:
   cmETH 50%, Aave 30%, USDY 15%, idle 5% (or hold current if within tolerance).
   Returns `AllocationResult` with `mode: "defensive"`.

4. **`src/engine/benchmark.ts`** — `computePerfDelta(vaultValueMeth, baselineMeth)`:
   returns perfDeltaBps as `int256`-safe number.
   `updateBaseline(baseline, deposit/withdrawal deltas)` for rolling baseline.

5. **`src/signals/cache.ts`** — generic `SignalCache<T>`:
   stores last good value + timestamp. `isStale(maxAgeMs)`. `update(value)`. `get()`.
   `MAX_CACHE_AGE = 3600_000` (1h). Immutable — always returns new object.

6. **`src/signals/nansen.ts`** — `nansenNetflows(tokens: string[])`:
   - `POST https://api.nansen.ai/api/v1/smart-money/netflows`
   - Headers: `{ apikey: env.NANSEN_API_KEY }`, body `{ chain: "mantle", tokenAddresses: tokens, timeframe: "1d" }`.
   - Zod schema `NansenNetflowSchema` validates the response shape.
   - Returns `Record<string, number>` (address → netflowUsd).
   - Wrapped in `fetchWithTimeout` (8s). On error, throw so caller can handle stale.

7. **`src/signals/elfa.ts`** — `elfaSentiment(symbols: string[])`:
   - `GET https://api.elfa.ai/v2/aggregations/trending-tokens`
   - Headers: `{ "x-elfa-api-key": env.ELFA_API_KEY }`.
   - Zod schema for response — handle both present + absent tokens gracefully.
   - Returns `Record<string, number | null>` (symbol → -1..+1 or null if absent).
   - **Critical:** Elfa Mantle coverage may be sparse. If all values null, that is
     valid — engine treats null sentiment as 0 tilt. Log the raw response once.

8. **`src/signals/gather.ts`** — `gatherSignals(caches)`:
   calls nansen + elfa with `safeFetch` wrapper. On failure uses last cached value.
   Sets `nansenStale` / `elfaStale` flags per KEEPER.md §3.3 logic.
   Returns `Signals`.

9. **`test/allocate.test.ts`** — vitest unit tests (at minimum 8 cases):
   - normal mode: high-USDY-yield → USDY gets highest bps
   - cap binding: a single strategy at 90% raw score gets clamped to its maxBps
   - idle floor: sum of targetBps never exceeds 10000 - idleFloorBps
   - renormalize: after cap clamp, remaining weight redistributed correctly
   - signal tilt: positive netflow nudges allocation up (bounded)
   - negative netflow: nudges allocation down (bounded, never below 0)
   - stale both: `nansenStale && elfaStale` → defensiveAllocation called
   - bps invariant: sum of all targetBps (incl idle) always equals 10000

10. **`test/degrade.test.ts`** — test graceful degrade:
    - stale nansen only → normal mode (elfa covers)
    - stale elfa only → normal mode (nansen covers)
    - both stale → defensive mode
    - null elfa sentiment → treated as 0 tilt (not crash)

**Success criteria:** `npm run test` — all tests pass. Engine is
deterministic given the same inputs.

**Commit:** `feat(keeper): allocation engine + Nansen/Elfa signals + unit tests`

---

## Session 6 — Keeper: Cycle + IPFS + Cron + Dockerfile (runnable)

**Goal:** Keeper runs end-to-end as a cron worker. One full cycle can be triggered
manually. IPFS reasoning pin works. Dockerfile builds.

**Working directory:** `packages/keeper`

**Read before coding:**
- `docs/KEEPER.md` sections 4 (Reasoning → IPFS) and 1 (Process model / 7 steps)
- `src/chain/vault.ts`, `src/engine/allocate.ts` from sessions 4–5

**Tasks:**

1. **`src/reasoning/build.ts`** — `buildReasoningJson(snapshot, signals, result, benchmark)`:
   Assembles the full reasoning JSON object from KEEPER.md §4.1.
   Returns a typed `ReasoningDoc` object (with version, timestamp, vault, inputs,
   scores, decision, rationale, benchmark fields).

2. **`src/reasoning/ipfs.ts`** — `pinReasoning(doc: ReasoningDoc)`:
   - Serialise doc to JSON string.
   - Upload via **Storacha** (`@web3-storage/w3up-client`) using the non-interactive
     UCAN server pattern — two env vars, no CLI at runtime:
     ```ts
     import * as Signer from '@ucanto/principal/ed25519'
     import { importDAG } from '@ucanto/core/delegation'
     import { CarReader } from '@ipld/car'
     import * as Client from '@web3-storage/w3up-client'
     import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
     import { keccak256, toBytes } from 'viem'

     async function parseProof(data: string) {
       const blocks: any[] = []
       const reader = await CarReader.fromBytes(Buffer.from(data, 'base64'))
       for await (const block of reader.blocks()) blocks.push(block)
       return importDAG(blocks)
     }

     export async function pinReasoning(doc: ReasoningDoc) {
       const principal = Signer.parse(process.env.STORACHA_AGENT_KEY!)
       const client = await Client.create({ principal, store: new StoreMemory() })
       const proof = await parseProof(process.env.STORACHA_DELEGATION!)
       const space = await client.addSpace(proof)
       await client.setCurrentSpace(space.did())
       const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' })
       const cid = (await client.uploadFile(blob)).toString()
       const reasoningHash = keccak256(toBytes(cid)) as `0x${string}`
       return { cid, reasoningHash }
     }
     ```
   - Required env vars: `STORACHA_AGENT_KEY`, `STORACHA_DELEGATION` (see setup below).
   - Returns `{ cid: string, reasoningHash: 0x${string} }`.

   **One-time Storacha setup (run locally before Session 6, ~10 min):**
   ```bash
   # Step 1 — generate a server agent keypair (save the output)
   npx ucan-key ed --json
   # → { did: "did:key:z6Mk...", key: "MgCZ..." }
   # set STORACHA_AGENT_KEY="MgCZ..."

   # Step 2 — create a Space and delegate to the agent DID (needs email confirm once)
   npm install -g @storacha/cli
   w3 login you@example.com        # one email click
   w3 space create meridian-keeper

   w3 delegation create did:key:z6Mk... \
     --can 'blob/add' --can 'index/add' \
     --can 'filecoin/offer' --can 'upload/add' | base64
   # → paste output as STORACHA_DELEGATION="..." in .env and Railway secrets
   ```
   After this, both env vars work unattended in Docker/Railway — no CLI at runtime.

   npm packages: `@web3-storage/w3up-client @ucanto/principal/ed25519
                  @ucanto/core/delegation @ipld/car`

   **Why not Pinata:** free tier caps at 500 files — fails within 3 weeks at 1/hr.
   **Why not NFT.storage:** decommissioned June 2024, no new uploads accepted.

3. **`src/cycle.ts`** — `runCycle()` async function, implements the 7 steps:
   ```
   1. readChainState()        → ChainState
   2. gatherSignals(caches)   → Signals
   3. computeAllocation(...)  → AllocationResult
   4. shouldRebalance(current, target, lastRebalance, cooldown)  → boolean + reason
   5. buildReasoningJson + pinReasoning  → { cid, reasoningHash }
   6. simulateRebalance + submitRebalance  → txHash
   7. recordDecision  → txHash
   ```
   - Step 4: skip if no strategy moves by more than `MIN_REBALANCE_DELTA_BPS` OR
     if `now < lastRebalance + cooldown`. Log reason.
   - Steps 5–7 only run if step 4 returns true.
   - Any step throwing → log full error + structured skip (no tx). Never crash.
   - Log structured JSON via pino at INFO level for each step outcome.

4. **`src/index.ts`** — bootstrap:
   - Load `.env` via dotenv.
   - Parse env via `config.ts` (throws on missing vars — good).
   - Init pino logger.
   - Register `node-cron` schedule: `*/${REBALANCE_INTERVAL_SECONDS / 60} * * * *`
     (every N minutes based on env).
   - Tiny Express app on port 3001:
     - `GET /health` → 200 `{ status: "ok", lastCycle, nextCycle }`.
     - `POST /trigger` (Bearer token guard using a `ADMIN_SECRET` env var) →
       calls `runCycle()` immediately, responds with the cycle result.
   - On startup: log all contract addresses and `readChainState()` output.

5. **`Dockerfile`** — multi-stage, Node 20 alpine:
   ```
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM node:20-alpine
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package.json .
   CMD ["node", "dist/index.js"]
   ```

6. **`package.json` scripts:**
   - `"build": "tsc"`, `"start": "node dist/index.js"`,
   - `"dev": "ts-node src/index.ts"`,
   - `"smoke": "ts-node src/smoke.ts"`,
   - `"test": "vitest run"`.

7. **End-to-end manual run:** start keeper in dev mode (`npm run dev`),
   POST to `/trigger`, observe logs showing all 7 cycle steps, confirm
   rebalance tx on Sepolia explorer and decision logged in registry.

**Success criteria:**
- `npm run build` compiles with no errors.
- `npm run dev` starts, `/health` returns 200.
- `/trigger` executes a full cycle: reads chain, gathers signals, computes
  allocation, pins to IPFS, submits rebalance tx, records decision.
- Rebalance tx visible at https://explorer.sepolia.mantle.xyz.

**Commit:** `feat(keeper): full cycle — IPFS pin, cron, /trigger endpoint, Dockerfile`

---

## Session 7 — Frontend: Next.js Setup + Wagmi + Deposit Page

**Goal:** Users can connect a wallet on Mantle Sepolia, approve mETH, and
deposit/withdraw from the vault. App is styled and feels like a real product.

**Working directory:** `packages/frontend`

**Architecture:** Next.js 14 App Router, wagmi v2, viem, shadcn/ui (card, button,
input, badge, table), tailwindcss, recharts (charts), pino (not needed here).

**Tasks:**

1. **Scaffold `packages/frontend` properly:**
   - `npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"`
   - Install: `wagmi@^2 viem@^2 @tanstack/react-query@^5 connectkit@latest recharts@^2`
   - Install shadcn: `npx shadcn-ui@latest init` → add card, button, input, badge,
     table, skeleton, toast components.

2. **`src/lib/chains.ts`** — define Mantle Sepolia chain for wagmi:
   ```ts
   export const mantleSepolia = defineChain({
     id: 5003,
     name: "Mantle Sepolia",
     nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
     rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
     blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
   })
   ```

3. **`src/lib/contracts.ts`** — typed contract addresses from sepolia.json +
   minimal ABI fragments for each contract (VaultCore, MeridianRegistry).
   Export `VAULT_ADDRESS`, `REGISTRY_ADDRESS` etc as `0x${string}` constants.

4. **`src/lib/wagmi.ts`** — wagmiConfig with ConnectKit provider, mantleSepolia chain.

5. **`src/app/layout.tsx`** — root layout: WagmiProvider + QueryClientProvider,
   ConnectKitProvider, dark theme, `<Header />` component.

6. **`src/components/Header.tsx`** — logo "Meridian", nav links (Dashboard,
   Deposit, Decisions), `<ConnectKitButton />` aligned right.

7. **`src/app/deposit/page.tsx`** — Deposit/Withdraw UI:
   - Shows vault name "mvmETH", current share price (totalAssets/totalSupply in mETH),
     user's mvmETH balance, user's mETH balance.
   - **Deposit tab:** input mETH amount → Approve button (if allowance insufficient)
     → Deposit button. Use `useWriteContract` for approve + deposit.
     Show tx pending / success / error states with toast notifications.
   - **Withdraw tab:** input mvmETH shares → Redeem button.
     Shows estimated mETH out (`previewRedeem`).
   - Form validation: amount > 0, amount ≤ balance.
   - All contract reads via `useReadContract` + `useBalance`.

8. **`src/app/page.tsx`** — redirect to `/dashboard` (or show minimal landing).

**Success criteria:** Open the app, connect MetaMask on Mantle Sepolia (chain 5003),
see mETH balance, approve + deposit → transaction appears in explorer.

**Commit:** `feat(frontend): Next.js + wagmi scaffold + deposit/withdraw page`

---

## Session 8 — Frontend: Dashboard + Decision Log Pages

**Goal:** Judges see a live dashboard showing vault TVL, AI allocation across 3
strategies, and a scrollable AI decision log that reconstructs reasoning from IPFS.

**Working directory:** `packages/frontend`

**Read before coding:** `docs/ARCHITECTURE.md` §1 (system overview, data flow)

**Tasks:**

1. **`src/hooks/useVaultState.ts`** — custom hook:
   Multicalls `totalAssets`, `idleAssets`, `totalSupply`, strategy `getBalance` x3,
   strategy `getCurrentAPY` x3. Returns typed `VaultState` object. Refetches every 15s.

2. **`src/hooks/useDecisions.ts`** — custom hook:
   Reads `DecisionRecorded` events from MeridianRegistry using `useWatchContractEvent`
   or `publicClient.getLogs`. For each event, fetches the IPFS JSON blob via the CID.
   Returns `Decision[]` sorted newest-first. Caches fetched IPFS blobs in React state.

3. **`src/app/dashboard/page.tsx`** — Dashboard:

   **Top row — 3 stat cards:**
   - Total Value Locked (mETH, formatted to 4 dp)
   - Share Price (mETH per mvmETH share)
   - AI vs Passive Hold (perfDeltaBps from latest decision, shown as +X bps)

   **Middle — Allocation chart + strategy table:**
   - Recharts `PieChart` / `RadialBarChart` showing live allocation across
     cmETH / Aave / USDY / Idle in distinct colors.
   - Table: strategy name | current balance (mETH) | APY % | allocation % | status badge.

   **Bottom — Recent Rebalances:**
   - Last 5 `Rebalanced` events from VaultCore (timestamp, strategies, txHash link).

4. **`src/app/decisions/page.tsx`** — AI Decision Log:

   **Page header:** "AI Decision Log — every rebalance is transparent and verifiable."

   **Decision cards** (one per `DecisionRecorded` event, newest first):
   Each card shows:
   - Timestamp (human readable)
   - Mode badge: NORMAL | DEFENSIVE
   - Allocation table (target bps per strategy, delta from previous)
   - Rationale paragraph (from `reasoning.rationale` IPFS field)
   - Raw scores bar chart (cmETH / Aave / USDY scores, pre-normalization)
   - Performance: perfDeltaBps (AI vs passive hold since last decision)
   - Footer: IPFS CID link + on-chain tx hash link (Mantlescan)

   **Skeleton loading states** while IPFS blobs are being fetched.
   **Empty state** if no decisions yet: "No rebalances recorded yet. The keeper
   runs every hour — check back soon."

5. **`src/app/dashboard/page.tsx`** also links to `/decisions` ("View full AI log →").

6. **Polish pass:**
   - All pages handle wallet-not-connected state gracefully.
   - Numbers use `Intl.NumberFormat` for readability.
   - Add `loading.tsx` files for Suspense boundaries.
   - Mobile-responsive layout (tailwind responsive prefixes).

**Success criteria:**
- Dashboard loads without wallet and shows live vault state from Sepolia.
- Decision log shows at least one real decision (requires Session 6 keeper to have run).
- IPFS reasoning blob renders correctly in the decision card.

**Commit:** `feat(frontend): dashboard + AI decision log with IPFS reasoning renderer`

---

## Session 8b — Real-World APY Feed + Rate Sync

**Goal:** Keeper reads live yield rates from real-world sources and mirrors them to
the testnet mock contracts each cycle. This produces genuine, organic allocation shifts
driven by actual Mantle DeFi market conditions — not synthetic drama.

**Background (analysis Jun 11 2026):**

Real-world APY snapshot vs current mock settings:

| Asset | Real APY | Old Mock | Fix |
|---|---|---|---|
| cmETH | **5.00%** (500 bps) | 350 bps | Mock was wrong — cmETH is highest yielder |
| USDY | **3.55%** (355 bps) | 500 bps | Mock was wrong — USDY dropped 110 bps (Fed cuts since Apr) |
| Aave WETH on Mantle | **1.86%** today, **8.92%** Jun 8 spike | 30 bps (broken) | Volatile — syncing to mainnet data creates natural rebalances |

Aave V3 WETH on Mantle swung 1.78% → 8.92% → 1.86% in one week (governance supply cap
cut 80k→10k WETH on Jun 4 caused utilisation spike). When Aave exceeded cmETH (5%) on
Jun 8, the agent should have shifted allocation. That's the demo story: real yield
rotation detected and acted on by the AI agent.

**Working directory:** `packages/keeper`

**Step 0 — One-time fix (cast send, run immediately):**

Fix Aave's broken mock rate (currently 30 bps → should be today's real 186 bps):
```bash
# 186 bps in ray-scaled units = 186 * 1e23 = 1.86e25
cast send 0x089Acb3d143a17B5Ae5375E743B140F14A3d1995 \
  "setLiquidityRate(uint256)" 18600000000000000000000000 \
  --rpc-url https://rpc.sepolia.mantle.xyz \
  --private-key $KEEPER_PRIVATE_KEY --legacy
```

Fix cmETH and USDY overrides in keeper config to match reality:
```
CMETH_APY_OVERRIDE_BPS=500    # 5.00% — mETH protocol published rate
USDY_APY_OVERRIDE_BPS=355     # 3.55% — current T-bill rate minus Ondo fee
```

**Tasks:**

1. **`src/signals/aaveRate.ts`** — `fetchAaveWethSupplyRateBps()`:
   - Fetch live Aave V3 WETH supply APR from Aavescan API:
     `GET https://aavescan.com/api/mantle-v3/reserve-history?asset=weth`
   - Fallback: read `getReserveData(WETH_MAINNET)` directly from Mantle mainnet
     Aave pool (`0x458F293454fE0d67EC0655f3672301301DD51422`) via a separate
     `mainnetPublicClient` (read-only, no signing needed).
   - Returns APY in bps (e.g. 186 for 1.86%).
   - Wrapped in `fetchWithTimeout(8000)`. On failure, returns last cached value.
   - Add `SignalCache<number>` for the Aave rate (same pattern as nansen/elfa caches).

2. **`src/chain/mockSync.ts`** — `syncMockRates(aaveRateBps)`:
   - Converts bps to ray-scaled units: `BigInt(aaveRateBps) * 10n**23n`
   - Calls `MockAavePool.setLiquidityRate(rayValue)` via `walletClient`.
   - Only calls if rate has changed by more than 10 bps since last sync (avoid
     unnecessary txs).
   - Guard: only runs when `NODE_ENV !== "production"` or `MOCK_SYNC_ENABLED=true`
     so this code path can never fire against a real Aave pool.
   - Returns `{ synced: boolean, newBps: number, txHash? }`.

3. **`src/config.ts` additions:**
   - `CMETH_APY_OVERRIDE_BPS` (default 500) — off-chain override for cmETH restaking APY.
     Rationale from CONTRACTS.md §4: "restaking APY isn't on-chain readable; keeper
     overrides via off-chain feed."
   - `USDY_APY_OVERRIDE_BPS` (default 355) — off-chain override for USDY T-bill APY.
   - `MOCK_SYNC_ENABLED` (default true on Sepolia) — gate for `mockSync.ts`.
   - `AAVE_MAINNET_RPC` (optional) — Mantle mainnet RPC for direct on-chain rate read
     as fallback to Aavescan API.

4. **`src/chain/vault.ts` update — apply APY overrides:**
   After reading `getCurrentAPY()` from each strategy, apply overrides where configured:
   ```ts
   // cmETH and USDY return hardcoded values on-chain (by design — no oracle).
   // Keeper applies off-chain feed overrides per CONTRACTS.md §4 / KEEPER.md §2.
   if (strategy.key === 'cmeth' && env.CMETH_APY_OVERRIDE_BPS)
     strategy.apyBps = env.CMETH_APY_OVERRIDE_BPS
   if (strategy.key === 'usdy' && env.USDY_APY_OVERRIDE_BPS)
     strategy.apyBps = env.USDY_APY_OVERRIDE_BPS
   ```

5. **`src/cycle.ts` update — insert rate sync as Step 1b:**
   ```
   1.  readChainState()          → ChainState
   1b. fetchAaveWethSupplyRateBps() → aaveRateBps (cached, safe)
       syncMockRates(aaveRateBps)   → updates MockAavePool on-chain
       apply APY overrides to ChainState strategies
   2.  gatherSignals()           → Signals
   ...
   ```
   Step 1b failure is non-fatal: log warning, keep existing mock rate, continue cycle.

6. **`.env.example` additions:**
   ```
   CMETH_APY_OVERRIDE_BPS=500
   USDY_APY_OVERRIDE_BPS=355
   MOCK_SYNC_ENABLED=true
   AAVE_MAINNET_RPC=https://rpc.mantle.xyz
   ```

7. **`test/mockSync.test.ts`** — unit tests:
   - bps→ray conversion is correct (186 bps → 1.86e25)
   - `syncMockRates` skips tx when rate change < 10 bps
   - `syncMockRates` no-ops when `MOCK_SYNC_ENABLED=false`

**Success criteria:**
- `npm run dev` starts keeper; `/trigger` produces a cycle where the reasoning JSON
  `inputs.apyBps` shows `cmeth: 500, usdy: 355, aave: <live rate>`.
- Calling `/trigger` twice with Aave rate manually changed between calls produces
  different target allocations.
- `MockAavePool.mockLiquidityRate` on Sepolia updates to match real Mantle rate after cycle.

**Demo narrative unlocked:**
With this in place, the agent's decision log over 4 days will show:
- Day 1 (Jun 11): cmETH=500, USDY=355, Aave=186 → cmETH dominant
- Day 2 (if Aave recovers to ~370 avg): allocation shifts toward Aave
- Days with Aave spike (like Jun 8 at 892 bps): Aave briefly exceeds cmETH → agent rebalances in
- Normalisation: agent moves back to cmETH

**Commit:** `feat(keeper): real-world APY feed — Aave rate sync + cmETH/USDY overrides`

---

## Session 9 — Integration + Agent Registration + Deploy + Submission

**Goal:** Everything wired end-to-end. Agent registered on ERC-8004. Frontend live
on Vercel. Demo recorded. Hackathon submission filed.

**Working directory:** root `/home/samalt/hackathon/meridian`

**Tasks:**

1. **Register agent on ERC-8004** (run once, from keeper wallet):
   ```bash
   cast send 0xf5bE0c99a828F4eAB72E743F883c22EB68caf5bE \
     "registerAgent(string)" \
     "ipfs://bafybei.../agent-manifest.json" \
     --rpc-url https://rpc.sepolia.mantle.xyz \
     --private-key $KEEPER_PRIVATE_KEY \
     --legacy
   ```
   The agent manifest JSON (pinned to IPFS before calling):
   ```json
   {
     "name": "Meridian Keeper v1",
     "description": "AI yield optimizer — rebalances mETH across cmETH restaking, Aave V3, and USDY on Mantle",
     "version": "1.0.0",
     "vault": "0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7",
     "capabilities": ["rebalance", "record_decision"]
   }
   ```

2. **Seed mocks for a credible demo:**
   - Mint test mETH to the keeper wallet using the testnet mETH faucet at
     `https://faucet.sepolia.mantle.xyz` or direct `cast send` to MockWETH if needed.
   - Set MockCmETH APY: `cast send MockCmETH "setApyBps(uint256)" 350 ...`
   - Set MockAavePool supply rate: `cast send MockAavePool "setSupplyRate(uint256)" 250 ...`
   - Confirm `readChainState()` shows non-zero APYs.

3. **Run keeper in dev, trigger first rebalance:**
   - `cd packages/keeper && npm run dev`
   - POST to `http://localhost:3001/trigger`
   - Verify: tx on Sepolia explorer, `DecisionRecorded` event on registry,
     IPFS CID resolves to valid reasoning JSON.

4. **Make a real deposit:**
   - Using the frontend (localhost:3000), connect the keeper wallet.
   - Deposit some test mETH into the vault.
   - Confirm shares minted correctly.

5. **Trigger a second rebalance** (with a deposit in the vault now).
   Verify decision log shows 2 entries in the frontend.

6. **Deploy frontend to Vercel:**
   - `vercel --prod` from `packages/frontend`.
   - Set env vars: `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_REGISTRY_ADDRESS`,
     `NEXT_PUBLIC_RPC_URL=https://rpc.sepolia.mantle.xyz`,
     `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
   - Test live URL: deposit, dashboard, decision log all load correctly.

7. **Update README.md** for hackathon submission:
   - One-paragraph project description.
   - Architecture diagram (reuse ASCII from ARCHITECTURE.md).
   - Live demo link (Vercel URL).
   - Deployed contracts table (from sepolia.json).
   - How to run locally (keeper + frontend).
   - "AI × RWA" angle: ERC-8004 agent identity, IPFS reasoning transparency,
     Nansen + Elfa signals.

8. **Final commit + tag:**
   ```bash
   git add .
   git commit -m "feat: complete Meridian — keeper, frontend, agent registration"
   git tag v1.0.0-hackathon
   ```

9. **Submit on DoraHacks:**
   - GitHub repo link.
   - Vercel live demo URL.
   - Contract addresses on Mantle Sepolia.
   - Demo video (2–3 min): deposit → keeper triggers → decision log shows AI reasoning →
     allocation chart updates.

**Success criteria:**
- Live Vercel URL shows dashboard with non-zero TVL.
- At least 2 real on-chain decisions visible in the decision log.
- IPFS CIDs resolve to readable reasoning JSON.
- ERC-8004 agentId > 0 on MeridianRegistry.
- Hackathon submission filed before June 15 23:59.

**Commit:** `feat(submission): agent registered, demo live, README final`

---

## Quick Reference — Key Constraints (copy into every session prompt)

```
Security rules (never violate):
- Deployer/Keeper wallet: 0x640CF727cDd96357d7f7B05A46cAb517012A7911
- Private key env var: KEEPER_PRIVATE_KEY (already in .env)
- RPC: https://rpc.sepolia.mantle.xyz  (chain ID 5003)
- forge/cast flags: always --legacy
- Max 70% allocation to any single strategy (7000 bps)
- 1h cooldown between rebalances
- Never generate a new wallet

WSL2 DNS note: rpc.sepolia.mantle.xyz resolves to 13.225.103.6 (CloudFront).
If forge/cast gives DNS errors, retry — it's intermittent.
```
