# Meridian Demo Script
## Turing Test 2026 · DoraHacks · AI x RWA Track
## Target runtime: 2:05 - 2:15

---

> **Before you record:** Have these open in separate tabs, fully loaded:
> - `/dashboard` at meridianprotocol.vercel.app
> - `/decisions` (at least one decision card loaded with IPFS reasoning fetched)
> - `/deposit`
> - MantleScan registry page: `https://sepolia.mantlescan.xyz/address/0x27796e411769ebf9b365e8534bae3a03c5588cad`
>
> Record at 1920x1080. No title card. No team intro. Cut straight to the dashboard.

---

## Segment 1: Hook [0:00 - 0:14]

**Screen:** `/dashboard`, fully loaded. TVL card visible top-left. Allocation bars visible (cmETH, Aave, USDY, Idle). Keeper activity feed showing at least one entry.

**Action:** None. Just let the dashboard breathe for 2 seconds before speaking.

**Narration:**
> "This is Meridian. Live on Mantle, right now. The AI keeper rebalances mETH hourly across three yield strategies. Most bots never show you why they moved your funds. Here, every decision the keeper makes is permanently on-chain and verifiable. Let me show you."

**Timing note:** Speak at a steady pace. Do not rush. The numbers on screen do the visual work.

---

## Segment 2: Navigate to AI Decision Log [0:14 - 0:20]

**Action:** Click "Full AI log" in the keeper activity feed (bottom right of the feed card) or navigate directly to `/decisions`.

**Screen:** `/decisions` page loads with a list of decision cards.

**Narration:**
> "AI Decision Log. This is the centerpiece of Meridian."

---

## Segment 3: AI Decision Log, Allocation and RWA Angle [0:20 - 0:33]

**Action:** Point cursor at (or hover over) the first decision card. Point specifically at the Target Allocation table showing cmETH, Aave, USDY, and Idle percentages.

**Screen:** Decision #1 header visible. Allocation table visible showing approximate values like `cmETH 48%, Aave 32%, USDY 12%, Idle 8%`.

**Narration:**
> "Decision one. The keeper put 48% into cmETH liquid restaking, 32% into Aave V3 lending, and 12% into USDY. USDY is an Ondo T-bill. This is the RWA sleeve. Real-world asset yield, on Mantle, managed by an AI agent with a permanent on-chain identity."

**Timing note:** Pause briefly after "Ondo T-bill" so the RWA framing lands.

---

## Segment 4: Expand Reasoning, Signals and Scores [0:33 - 0:55]

**Action:** Click the "AI Reasoning" toggle button to expand the reasoning section inside the first decision card.

**Screen:** Reasoning section expands to show: rationale text, raw scores bar chart (cmETH, aave, usdy bars), signal freshness indicators (green "Nansen live", green "Elfa live").

**Narration:**
> "I'll open the full reasoning. Nansen smart-money flows for mETH were positive. Elfa sentiment was live. The allocation engine scored each strategy and produced this. Nothing in here is hardcoded. These bars are the raw scores before normalization. cmETH scored highest on APY combined with the positive Nansen signal. USDY earns its slot as the stable yield sleeve."

**Timing note:** As you say "these bars," point the cursor at the score bars chart.

---

## Segment 5: IPFS CID, Full Reasoning On Demand [0:55 - 1:09]

**Action:** Scroll to the footer of the expanded decision card. Point at the truncated IPFS CID. Then click the "IPFS reasoning" external link to open the raw JSON in a new tab.

**Screen:** Footer shows timestamp, truncated CID like `bafybeig...`, and two links: "IPFS reasoning" and "On-chain".

**Narration:**
> "Down here is the IPFS CID for this specific reasoning blob. I'll click it. You get the full JSON. The exact Nansen netflow numbers that drove the signal tilt. The exact Elfa scores. No summarizing. The raw inputs that produced this allocation. Every cycle pins a new one."

**Timing note:** Let the IPFS tab open visibly (1-2 seconds of the raw JSON on screen) before narrating the next line.

---

## Segment 6: On-chain Hash and ERC-8004 Reputation [1:09 - 1:20]

**Action:** Return focus to the decision card. Point at or click the "On-chain" link in the footer to open MantleScan.

**Screen:** MantleScan page for MeridianRegistry, or just point at the on-chain link and the performance delta number visible in the card header.

**Narration:**
> "That CID hash is stored in MeridianRegistry on Mantle, permanently. If the reasoning blob changes, the hash breaks. And this performance delta, the keeper's outperformance versus passive hold, feeds into its ERC-8004 reputation score on-chain, with every single cycle."

---

## Segment 7: Deposit Flow [1:20 - 1:38]

**Action:** Navigate to `/deposit`.

**Screen:** Deposit page. Show the vault stats row at top (TVL, share price, position). Then point at the deposit tab showing the approve and deposit steps. Point at the safety constraints pills at the bottom ("cmETH max 60%", "Aave max 60%", "USDY max 50%", "1h cooldown").

**Narration:**
> "Deposit page. Connect a wallet, enter an amount, approve mETH, deposit. You receive mvmETH shares. Standard ERC-4626. The safety constraints are hardcoded in the vault. The keeper cannot withdraw to an arbitrary address. It can only call rebalance within these bounds."

---

## Segment 8: Architecture Callout [1:38 - 1:48]

**Action:** Quickly switch to the README on GitHub or a browser tab showing the architecture diagram (the mermaid chart from README.md). Point at the diagram for a few seconds.

**Screen:** Mermaid architecture diagram visible, showing: User, VaultCore, three strategies, Keeper, Nansen/Elfa, IPFS, MeridianRegistry.

**Narration:**
> "The full system: VaultCore on Mantle, three strategies, the keeper reads live signals, pins reasoning to IPFS, calls rebalance, then logs the decision on-chain via MeridianRegistry. Five deployed contracts, all verified on Mantlescan."

---

## Segment 9: Return to Dashboard and Close [1:48 - 2:05]

**Action:** Return to `/dashboard`. Let it sit for 2 seconds while narrating.

**Screen:** Dashboard showing live allocation bars with USDY visible, keeper countdown, activity feed.

**Narration:**
> "Back on the live dashboard. Every number here is from Mantle Sepolia. cmETH restaking, Aave V3 lending, USDY T-bills. All on Mantle. The keeper has a track record now, tied to agent identity number 146, and it grows with each cycle.
>
> What's next: mainnet deployment, integration with real Ondo USDY, and a Mantle EcoFund grant application to expand the RWA strategy surface. Meridian is built for Mantle."

**Timing note:** The last line "Meridian is built for Mantle" is the close. Cut to black or fade after a one-second pause.

---

## Full Timing Reference

| Segment | Time | Duration | Focus |
|---|---|---|---|
| Hook | 0:00 - 0:14 | 14s | Dashboard, live numbers, differentiator |
| Navigate | 0:14 - 0:20 | 6s | Transition to /decisions |
| RWA angle | 0:20 - 0:33 | 13s | Allocation table, USDY T-bill pitch |
| Expand reasoning | 0:33 - 0:55 | 22s | Rationale, scores, Nansen/Elfa signals |
| IPFS CID | 0:55 - 1:09 | 14s | Click CID link, raw JSON on screen |
| On-chain hash + ERC-8004 | 1:09 - 1:20 | 11s | Hash integrity, reputation score |
| Deposit | 1:20 - 1:38 | 18s | Approve flow, safety constraints |
| Architecture | 1:38 - 1:48 | 10s | Mermaid diagram, system overview |
| Dashboard + close | 1:48 - 2:05 | 17s | Live numbers, what's next, Mantle |
| **Total** | | **~2:05** | |

The decision log segments (0:20 - 1:20) total **60 seconds**, which satisfies the 50-60s requirement for the centerpiece.

---

## If You Only Have Time For ONE Thing

**[0:55 - 1:09]**: click the IPFS CID link with the raw JSON visibly loading.

This is the single moment that separates Meridian from every other AI yield bot. The keeper just explained itself, in full, with the actual numbers that drove the decision, accessible to anyone with a browser and the CID. Say: "This is the exact input that moved your funds." That sentence, on camera, with the JSON visible, is the whole thesis.

---

## Pre-flight Checklist (20 Project Deployment Award)

Before submitting the video link, verify each item:

| Requirement | Status | Action if not done |
|---|---|---|
| Contract verified on Mantle Explorer | Verify at `sepolia.mantlescan.xyz/address/0x94fB1E81b912e11fD2718e261EA39810C80c7471`. "Contract" tab should show source code. | Run `forge verify-contract` per `docs/ARCHITECTURE.md §6` |
| AI function callable on-chain | `rebalance()` and `recordDecision()` are live. Trigger a cycle via `curl -X POST /trigger` and confirm a tx hash appears on Mantlescan | Start the keeper, hit `/trigger`, check MantleScan |
| Frontend publicly deployed (not localhost) | meridianprotocol.vercel.app loads on a device that has never visited before | Redeploy on Vercel if the URL redirects or 404s |
| Deployment address ready to paste | `0x94fB1E81b912e11fD2718e261EA39810C80c7471` (VaultCore), `0x27796e411769ebf9b365e8534bae3a03c5588cad` (Registry) | Pull from `packages/contracts/deployments/sepolia.json` |
| README has setup instructions | README.md Quick Start section covers `forge install && forge test`, keeper `npm test`, frontend `npm run dev` | Already present. Double-check the clone URL is correct. |
| README has architecture | README.md has Mermaid diagram and How It Works section | Already present |
| README has contract addresses | README.md Live Deployment table has all 11 contracts with explorer links | Already present |
| At least one real on-chain decision exists | `/decisions` page shows at least one entry with a real IPFS CID | Trigger keeper manually if empty |
| ERC-8004 agent registered | Agent #146 at `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Call `registerAgent()` if `agentId == 0` in registry |
