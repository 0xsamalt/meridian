# Meridian

**AI-powered yield optimizer vault on Mantle — every rebalance decision is transparent, verifiable, and anchored on-chain.**

Meridian is an ERC-4626 vault that holds mETH and allocates it across three yield strategies. An off-chain AI keeper reads live market signals (Nansen smart-money flows, Elfa social sentiment, Aave on-chain rates), computes the optimal allocation, publishes its full reasoning to IPFS, then executes the rebalance and records the decision permanently on-chain via an ERC-8004 agent identity. Judges and users can audit every decision back to the raw signal inputs.

---

## Architecture

```
 User
  │  deposit / withdraw (ERC-4626)
  ▼
┌─────────────────────────────────────────────┐
│  VaultCore  (mETH ERC-4626)                 │
│   idleBuffer + 3 strategies                 │
└───┬─────────┬────────────┬──────────────────┘
    │         │            │
    ▼         ▼            ▼
CmethStrategy  AaveStrategy  UsdyStrategy
mETH→cmETH     mETH→WETH     mETH→USDC
(restaking)    →aWETH(Aave)  →USDY(T-bill)

                  ▲ rebalance()
                  │
        ┌─────────┴─────────┐
        │   AI Keeper        │
        │  1. readChainState │
        │  2. Nansen signals │
        │  3. Elfa sentiment │
        │  4. allocate()     │
        │  5. IPFS pin       │
        │  6. rebalance tx   │
        │  7. recordDecision │
        └───────────────────┘
                  │
        ┌─────────┴─────────┐
        │  MeridianRegistry  │
        │  ERC-8004 agent id │
        │  on-chain log +    │
        │  IPFS CID per tx   │
        └───────────────────┘
```

---

## Live Demo

**Frontend (Vercel):** _deploy URL here after `vercel --prod`_

**Mantle Sepolia Explorer:** https://sepolia.mantlescan.xyz

---

## Deployed Contracts (Mantle Sepolia — chain 5003)

| Contract          | Address |
|-------------------|---------|
| VaultCore         | [0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7](https://sepolia.mantlescan.xyz/address/0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7) |
| CmethStrategy     | [0x87Af08833081B09222695133017d25c06eFAa12E](https://sepolia.mantlescan.xyz/address/0x87Af08833081B09222695133017d25c06eFAa12E) |
| AaveStrategy      | [0x22923419faBE7853b3E4fE4fBE2C90EDc21DA090](https://sepolia.mantlescan.xyz/address/0x22923419faBE7853b3E4fE4fBE2C90EDc21DA090) |
| UsdyStrategy      | [0x697b88a6BF3Df8D038b5685833f62646b1F1980a](https://sepolia.mantlescan.xyz/address/0x697b88a6BF3Df8D038b5685833f62646b1F1980a) |
| MeridianRegistry  | [0x27796e411769ebf9b365e8534bae3a03c5588cad](https://sepolia.mantlescan.xyz/address/0x27796e411769ebf9b365e8534bae3a03c5588cad) |
| MockCmETH         | [0x718708c91d2e26E2EE531C4722A684b2D0d9e21e](https://sepolia.mantlescan.xyz/address/0x718708c91d2e26E2EE531C4722A684b2D0d9e21e) |
| MockAavePool      | [0x089Acb3d143a17B5Ae5375E743B140F14A3d1995](https://sepolia.mantlescan.xyz/address/0x089Acb3d143a17B5Ae5375E743B140F14A3d1995) |
| MockSwapRouter    | [0xf5b1954Cd83B707F3AB1ef1FA4ED184F0891D1cE](https://sepolia.mantlescan.xyz/address/0xf5b1954Cd83B707F3AB1ef1FA4ED184F0891D1cE) |

ERC-8004 Agent ID: **146** — registered on `AgentIdentity` at `0x8004A818BFB912233c491871b3d84c89A494BD9e`

---

## AI × RWA Angle

- **ERC-8004 agent identity:** the keeper holds a verifiable on-chain identity (NFT #146). Every decision updates its reputation score.
- **IPFS reasoning transparency:** each rebalance pins a full reasoning JSON (signal inputs, per-strategy scores, rationale, allocation deltas) to IPFS. The CID is stored on-chain in `MeridianRegistry` — anyone can audit the exact inputs that drove each decision.
- **Real-world signals:** Nansen smart-money net-flows + Elfa social sentiment tilt the yield-based allocation. Aave supply APR is fetched live from the mainnet pool each cycle to track real Mantle DeFi conditions.
- **RWA sleeve:** `UsdyStrategy` routes mETH → USDC → USDY (Ondo T-bill) — demonstrating a programmable RWA allocation managed by an AI agent. Capped at 0 on mainnet until Ondo KYC integration; full flow runs on testnet via MockUSDY.

---

## How to Run Locally

### Prerequisites

- Node 20, Foundry, `cast`
- Clone repo, `cp .env.example .env` and fill in the required vars (see `.env.example`)

### Contracts

```bash
cd packages/contracts
forge build
forge test
```

### Keeper

```bash
cd packages/keeper
npm install
npm run dev          # starts on :3001
# In another terminal:
curl -X POST http://localhost:3001/trigger \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

### Frontend

```bash
cd packages/frontend
npm install
npm run dev          # starts on :3000
```

Connect MetaMask to Mantle Sepolia (chain 5003, RPC `https://rpc.sepolia.mantle.xyz`), then approve + deposit mETH.

---

## Security

- Keeper has no custody path — it can only call `rebalance()` (capped + 5-min cooldown on testnet) and `recordDecision()`.
- Max 70% allocation to any single strategy (hardcoded in vault).
- Guardian can pause deposits + new rebalances instantly; withdrawal is never paused.
- All swap pricing uses 30-min TWAP with a 2% deviation band against a reference feed — never `slot0`.
- Full threat model: [`docs/RISKS.md`](docs/RISKS.md)

---

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system overview
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — full contract spec with inline rationale
- [`docs/RISKS.md`](docs/RISKS.md) — threat model and mitigations
- [`docs/KEEPER.md`](docs/KEEPER.md) — keeper algorithm and signal integration
