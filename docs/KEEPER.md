# Meridian — Keeper Architecture

The keeper is the **off-chain AI strategist**. It gathers signals, computes a target
allocation, pins its reasoning to IPFS, and triggers the on-chain `rebalance`. It is
**not** a custodian — its on-chain powers are limited to `rebalance(...)` (capped +
cooldown-gated) and `recordDecision(...)`. See [RISKS.md](./RISKS.md) §1.

**Stack:** Node.js 20 + TypeScript, `viem` (chain I/O), `node-cron` (scheduling),
`web3.storage` (IPFS), `zod` (input validation), `pino` (structured logs).
**Host:** Railway worker. Secrets via Railway env (never in image).

---

## 1. Process model

```
┌───────────────────────────────────────────────────────────────┐
│ keeper (single long-lived worker)                              │
│                                                                │
│  node-cron ── every REBALANCE_INTERVAL (default 1h) ─┐         │
│                                                       ▼         │
│   ┌─────────────────────── cycle() ───────────────────────┐    │
│   │ 1. readChainState()    vault + strategies (viem)       │    │
│   │ 2. gatherSignals()     Nansen + Elfa  (cached, safe)   │    │
│   │ 3. computeAllocation() pure fn → targetBps[]           │    │
│   │ 4. shouldRebalance()   delta gate + cooldown           │    │
│   │ 5. pinReasoning()      build JSON → IPFS → cid         │    │
│   │ 6. submitRebalance()   vault.rebalance(...) tx         │    │
│   │ 7. recordDecision()    registry.recordDecision(...)    │    │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│  on any step failure → log + alert + SAFE-SKIP (no tx)        │
└───────────────────────────────────────────────────────────────┘
```

**Triggers (any of):**
- **Time:** every `REBALANCE_INTERVAL_SECONDS` (default 3600).
- **Signal delta:** an out-of-band lightweight poll (every 10 min) that only escalates
  to a full cycle if a signal moved enough to change allocation by `MIN_REBALANCE_DELTA_BPS`.
- **Manual:** an authenticated `/trigger` admin endpoint for demos.

**Cooldown:** the on-chain `cooldown` (1h) is the source of truth. The keeper mirrors it
locally (`COOLDOWN_SECONDS`) to avoid wasting gas on a tx the contract will revert.

---

## 2. Allocation engine (the core IP)

Pure, deterministic, unit-testable function. **No network calls inside** — it takes a
fully-formed snapshot and returns basis points. This is what makes the AI reproducible
and the reasoning honest.

```ts
interface StrategySnapshot {
  key: "cmeth" | "aave" | "usdy";
  address: `0x${string}`;
  apyBps: number;          // from getCurrentAPY() (+ off-chain override for cmeth/usdy)
  balanceMeth: bigint;     // getBalance()
  maxBps: number;          // on-chain cap
  // risk inputs:
  liquidityUsd: number;    // venue depth (manipulation/exit risk)
  protocolRiskScore: number; // 0..1, lower = safer (curated)
}

interface Signals {
  // Nansen — smart-money behaviour on Mantle
  smartMoneyNetflowUsd: Record<string, number>;  // per asset, 24h
  // Elfa — social sentiment (may be sparse for Mantle assets — see §3)
  sentiment: Record<string, number>;             // -1..+1 per asset, null-safe
  // freshness
  nansenStale: boolean;
  elfaStale: boolean;
}

interface AllocationResult {
  targetBps: Record<string, number>;   // sums to <= 10000
  scores: Record<string, number>;      // pre-normalization, for the reasoning log
  rationale: string;                   // human-readable explanation
  mode: "normal" | "defensive";        // defensive when signals stale/missing
}
```

### Algorithm (pseudocode)

```
computeAllocation(strategies, signals, config):

  # 1) DEFENSIVE MODE — if both signal sources are stale, do NOT chase yield.
  if signals.nansenStale and signals.elfaStale:
      return defensiveAllocation(strategies)   # see §2.1

  # 2) base score = risk-adjusted yield
  for s in strategies:
      yieldScore  = s.apyBps / 100                      # 0..~N
      riskPenalty = config.riskWeight * s.protocolRiskScore
      liqBonus    = clamp(log10(s.liquidityUsd) / 8, 0, 1)   # deeper venue = safer to size up

      # 3) signal tilt (bounded so signals can only TILT, never dominate)
      nf  = normalize(signals.smartMoneyNetflowUsd[s.assetForSignal])  # -1..+1
      snt = signals.sentiment[s.assetForSignal] ?? 0                   # null-safe
      signalTilt = config.signalWeight * (0.7 * nf + 0.3 * snt)        # capped ±maxTilt

      rawScore[s] = max(0, yieldScore * (1 + signalTilt) + liqBonus - riskPenalty)

  # 4) convert scores -> bps, then clamp to per-strategy caps, renormalize
  targetBps = normalizeToBps(rawScore)          # sums to 10000
  targetBps = applyCaps(targetBps, maxBps)      # clamp each to on-chain cap
  targetBps = renormalize(targetBps)            # redistribute clipped weight
  targetBps = enforceIdleFloor(targetBps, config.idleFloorBps)  # keep e.g. 300 bps idle

  rationale = renderRationale(rawScore, signals, targetBps)
  return { targetBps, scores: rawScore, rationale, mode: "normal" }
```

**Why bounded tilt:** yield + risk + liquidity decide the *base* allocation. Nansen/Elfa
signals can only nudge it within `±maxTilt` (e.g. ±25%). This prevents a single
manipulated social spike or a flash netflow from dumping the whole vault into one venue
— and it keeps the strategy explainable. A judge asking "why did it pick this?" gets a
clear answer.

### 2.1 Defensive allocation
When signals are missing/stale, fall back to a **pure risk-adjusted-yield** split with
extra weight to the safest venue (cmETH, no swap/peg risk) and a larger idle buffer.
Never rebalance aggressively on blind data.

```
defensiveAllocation: cmeth 50% (cap-bounded), aave 30%, usdy 15%, idle 5%
                     (or hold current allocation if within tolerance — cheapest)
```

### 2.2 Config defaults
```ts
const CONFIG = {
  riskWeight: 20, signalWeight: 0.25, maxTilt: 0.25,
  idleFloorBps: 300, minRebalanceDeltaBps: 300,
  // curated, conservative protocol risk scores (0 safe … 1 risky)
  protocolRisk: { cmeth: 0.15, aave: 0.10, usdy: 0.20 },
};
```

---

## 3. API integration

### 3.1 Nansen — `https://api.nansen.ai` (CONFIRMED Mantle support)
- Auth header: `apikey: <NANSEN_API_KEY>`. Chain param: `"mantle"`.
- Endpoints used:
  - `POST /api/v1/smart-money/netflows` — smart-money in/out per token (24h window).
  - `POST /api/v1/smart-money/holdings` — what smart money holds (context).
  - `POST /api/v1/tgm/flows` — Token God Mode flows for mETH/WETH/USDC.
- Pattern:
```ts
async function nansenNetflows(tokens: string[]): Promise<Record<string, number>> {
  const res = await fetchWithTimeout("https://api.nansen.ai/api/v1/smart-money/netflows", {
    method: "POST",
    headers: { apikey: env.NANSEN_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ chain: "mantle", tokenAddresses: tokens, timeframe: "1d" }),
  }, 8000);
  const json = NansenNetflowSchema.parse(await res.json());   // zod validate
  return mapNetflows(json);
}
```

### 3.2 Elfa AI — `https://api.elfa.ai/v2` (Mantle coverage UNVERIFIED)
- Auth header: `x-elfa-api-key: <ELFA_API_KEY>`.
- Endpoints: `GET /v2/aggregations/trending-tokens`, mentions/sentiment search by symbol.
- **Critical:** Elfa is social-mention driven and its Mantle-token coverage is
  undocumented. **Day-4 task: probe `$MNT`, `$mETH` and log raw responses.** If coverage
  is empty/sparse:
  - degrade gracefully — `sentiment[asset] = null` → engine treats tilt component as 0;
  - keep Elfa as a *secondary* signal (30% weight) so its absence doesn't break the bot;
  - in the pitch, frame Nansen (on-chain, confirmed) as primary and Elfa as
    sentiment-overlay. Honest and robust.

### 3.3 Caching + staleness (never fail-open)
```ts
async function gatherSignals(): Promise<Signals> {
  const nansen = await safeFetch(() => nansenNetflows(TOKENS), cache.nansen);
  const elfa   = await safeFetch(() => elfaSentiment(TOKENS),  cache.elfa);
  return {
    smartMoneyNetflowUsd: nansen.value ?? cache.nansen.last ?? {},
    sentiment:            elfa.value   ?? cache.elfa.last   ?? {},
    nansenStale: nansen.failed && cache.nansen.ageMs > MAX_CACHE_AGE,  // 1h
    elfaStale:   elfa.failed   && cache.elfa.ageMs   > MAX_CACHE_AGE,
  };
}
```
- On API failure: use last good value if < 1h old; else mark **stale** → engine enters
  **defensive mode**. The keeper **never** rebalances on empty data.

---

## 4. Reasoning → IPFS → on-chain

### 4.1 Reasoning JSON (pinned to IPFS)
```json
{
  "version": "1.0",
  "timestamp": 1749000000,
  "vault": "0x...",
  "totalAssetsMeth": "123456789000000000000",
  "inputs": {
    "apyBps": { "cmeth": 350, "aave": 280, "usdy": 500 },
    "balancesMeth": { "cmeth": "...", "aave": "...", "usdy": "..." },
    "nansenNetflowUsd": { "mETH": 120000, "WETH": -40000, "USDC": 80000 },
    "elfaSentiment": { "mETH": 0.32, "MNT": 0.10 },
    "stale": { "nansen": false, "elfa": false }
  },
  "scores": { "cmeth": 41.2, "aave": 33.8, "usdy": 52.1 },
  "decision": { "targetBps": { "cmeth": 3500, "aave": 2700, "usdy": 3500, "idle": 300 }, "mode": "normal" },
  "rationale": "USDY sleeve scored highest on 5% T-bill yield with positive USDC smart-money inflow (+$80k). cmETH favored over Aave: no swap/peg risk and comparable risk-adjusted yield. Capped USDY at 35% per risk policy; 3% idle retained for exit liquidity.",
  "benchmark": { "passiveHoldMeth": "...", "vaultValueMeth": "...", "perfDeltaBps": 47 }
}
```

### 4.2 Pin + anchor
```ts
const cid = await web3Storage.put(reasoningJson);          // ipfs cid
const reasoningHash = keccak256(toBytes(cid));             // bytes32

// 1) rebalance
const txHash = await walletClient.writeContract({
  address: env.VAULT_ADDRESS, abi: vaultAbi, functionName: "rebalance",
  args: [strategyAddrs, targetBpsArray, reasoningHash],
});
await publicClient.waitForTransactionReceipt({ hash: txHash });

// 2) anchor decision (hash MUST equal keccak256(cid) — contract enforces)
await walletClient.writeContract({
  address: env.REGISTRY_ADDRESS, abi: registryAbi, functionName: "recordDecision",
  args: [reasoningHash, cid, perfDeltaBps, totalAssets],
});
```

> The contract requires `reasoningHash == keccak256(cid)`, so the on-chain log is
> tamper-evident: anyone can fetch the IPFS blob and verify it matches the hash that
> accompanied the actual fund movement.

---

## 5. Performance benchmark (the "Turing Test" number)

Each cycle the keeper computes the vault's value vs a **passive-hold baseline** (what
the same initial mETH would be worth if simply held / left in cmETH), expressed in bps,
and stores it as `perfDeltaBps`. This:
- feeds the dashboard "AI vs passive hold" chart,
- drives the ERC-8004 reputation score (positive delta → +1 feedback),
- is the headline demo metric: *"Meridian's agent is beating buy-and-hold by X bps."*

```
perfDeltaBps = ((vaultValueMeth - passiveBaselineMeth) * 10000) / passiveBaselineMeth
```
Baseline is snapshotted at first deposit and rolled forward with deposits/withdrawals so
it stays apples-to-apples.

---

## 6. Security & ops

| Concern | Implementation |
|---|---|
| **Key management** | `KEEPER_PRIVATE_KEY` in Railway secret store; never in repo/image. Rotate via `grantRole/revokeRole(KEEPER_ROLE)` from admin multisig — no redeploy needed. Roadmap: replace hot key with **Gelato/Chainlink Automation** so nothing holds even capped powers. |
| **Capped blast radius** | Keeper can only call `rebalance` (caps + cooldown enforced on-chain) and `recordDecision`. Cannot withdraw to arbitrary address. A stolen key = at most cap-bounded reshuffling + false logs, never theft. |
| **Cooldown** | Local mirror of on-chain `cooldown`; skip cycle if `now < lastRebalance + cooldown`. |
| **Fail-safe, not fail-open** | Any failure in steps 1–5 → log + alert + **skip** (no tx). Never rebalance on stale/empty signals. |
| **Idempotency** | Before submit, re-read `lastRebalance`; if another tx already rebalanced this window, abort. |
| **Gas** | Pre-simulate with `publicClient.simulateContract`; if revert (cap/cooldown), skip cleanly. MNT gas funded; low-balance alert. |
| **Nonce/stuck tx** | viem nonce mgmt + receipt wait with timeout; on timeout, bump fee and retry once, else alert. |
| **Observability** | pino JSON logs → Railway; alert to Telegram/Discord webhook on: rebalance success, skip-reason, API failure, low gas, tx revert. |
| **Input validation** | All API responses parsed with `zod`; malformed data → treat as stale (defensive mode). |

---

## 7. File layout

```
keeper/
├── src/
│  ├── index.ts             # cron bootstrap + /trigger admin endpoint
│  ├── cycle.ts             # orchestrates the 7 steps
│  ├── chain/
│  │  ├── clients.ts        # viem public + wallet clients (Mantle)
│  │  ├── vault.ts          # readChainState, submitRebalance
│  │  └── registry.ts       # recordDecision
│  ├── signals/
│  │  ├── nansen.ts         # netflows/holdings (+ zod schemas)
│  │  ├── elfa.ts           # sentiment (+ graceful degrade)
│  │  └── cache.ts          # staleness-aware cache
│  ├── engine/
│  │  ├── allocate.ts       # PURE computeAllocation()  ← unit-tested core
│  │  ├── defensive.ts
│  │  └── benchmark.ts      # perfDeltaBps
│  ├── reasoning/
│  │  ├── build.ts          # reasoning JSON
│  │  └── ipfs.ts           # web3.storage pin + keccak256(cid)
│  └── config.ts
├── test/
│  ├── allocate.test.ts     # deterministic engine tests (many fixtures)
│  ├── degrade.test.ts      # stale-signal → defensive mode
│  └── benchmark.test.ts
├── .env.example
├── package.json
└── Dockerfile
```

**Testing the engine:** because `computeAllocation` is pure, drive it with fixtures —
high-yield-USDY, stale-signals, negative-netflow, cap-binding, single-venue-spike — and
assert bps sums, cap compliance, and defensive triggering. This is the highest-value
test surface in the whole keeper and the easiest to make bulletproof.

See [CONTRACTS.md](./CONTRACTS.md) for the on-chain ABI the keeper targets and
[RISKS.md](./RISKS.md) for how each keeper mitigation maps to a rated threat.
