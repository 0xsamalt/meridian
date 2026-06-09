# Meridian — Frontend Design System

**Direction: "Quiet Intelligence"**
A dark institutional interface where every number earns its place and the AI surfaces
insight without theatrics — the visual language of a trusted quant desk, not a
trading floor.

---

## The Design Problem

Users are depositing real mETH. The design's job is to answer an unspoken question
before the user even connects their wallet: *"Can I trust this?"*

That answer comes from restraint, precision, and transparency — not from hype,
gradients, or a big APY number in neon green.

**Mood board (study these before writing a single line of CSS):**
1. **Tesseract** (tesseract.fi) — gold standard for institutional DeFi vault UI
2. **Gauntlet** (gauntlet.xyz) — how "AI for finance" positions as trusted advisor, not gimmick
3. **Linear** (linear.app) — dark SaaS done right: Inter type, restrained accent, skeleton states

---

## Visual Elements

The rule: **every animated or 3D element must be connected to the product's meaning**.
A spinning orb is decoration. Allocation bars that move when the AI rebalances
*are* the product. Build semantic visuals first, decorative visuals last.

### Priority 1 — Animated Allocation Bars + APY Counters *(build this first)*

**Tool:** Framer Motion (`framer-motion`)
**Placement:** Strategy cards on the Dashboard, and the summary allocation bar
**What it does:** When the AI rebalances, the bar widths animate from old to new
allocation using a spring curve. APY and TVL numbers count up on mount and
update in real time.

This is the single highest-impact visual. It directly shows the AI working —
bars visibly shift after each rebalance. A static chart makes the AI invisible.

```tsx
// Animated allocation bar — width springs to new value on rebalance
<motion.div
  className="h-1.5 rounded-full"
  style={{ background: strategyColor }}
  initial={{ width: "0%" }}
  animate={{ width: `${allocationPct}%` }}
  transition={{ type: "spring", stiffness: 60, damping: 20 }}
/>

// Animated number counter (APY, TVL)
// Recipe: buildui.com/recipes/animated-counter
// The number smoothly increments rather than snapping to the new value.
// Apply to: APY %, TVL in mETH, share price, earned yield ticker
```

Install: `npm install framer-motion`

---

### Priority 2 — ShaderGradient Hero Background

**Tool:** `@shadergradient/react`
**Placement:** Full-bleed behind the hero section (Dashboard above the stats bar).
Covers maybe 40vh. Fades to `#0A0D12` at the bottom.
**What it does:** A WebGL animated gradient that creates an almost imperceptible
slow dark drift — the background feels alive without demanding attention.
Inspired by Morpho's "grain style" textural backgrounds.

```tsx
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react"

// In your hero section:
<div className="relative h-[40vh] overflow-hidden">
  <ShaderGradientCanvas className="absolute inset-0">
    <ShaderGradient
      color1="#0A0D12"     // your exact bg color — baseline
      color2="#0F2040"     // deep navy — barely-visible shift
      color3="#12183A"     // indigo-black — subtle violet undertone
      brightness={0.6}     // pull brightness down hard
      grain={0.4}          // grain texture = Morpho aesthetic
      type="waterPlane"    // slow horizontal drift, NOT a spinning orb
      animate="on"
      uSpeed={0.1}         // very slow — institutional, not playful
      cDistance={32}
      cPolarAngle={125}
    />
  </ShaderGradientCanvas>
  {/* hero content sits on top */}
</div>
```

**Fallback:** If WebGL is unavailable, the `#0A0D12` solid color shows through — 
no broken experience.

Install: `npm install @shadergradient/react`

---

### Priority 3 — Decision Log Stagger Animation

**Tool:** Framer Motion `AnimatePresence` + `staggerChildren`
**Placement:** The `/decisions` page feed
**What it does:** Each new decision entry slides in from the bottom with a 40ms
stagger. When a new decision arrives live, the newest card briefly pulses its
violet left-border. This makes the feed feel like a live intelligence stream,
not a static table.

```tsx
<AnimatePresence>
  {decisions.map((d, i) => (
    <motion.div
      key={d.index}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04, duration: 0.3 }}
    >
      <DecisionCard decision={d} />
    </motion.div>
  ))}
</AnimatePresence>
```

---

### Priority 4 — Subtle Particle Constellation (optional polish)

**Tool:** React Three Fiber (`@react-three/fiber`) + `@react-three/drei`
**Placement:** Behind the hero section, as a secondary background layer under
the ShaderGradient or replacing it if you want more depth.
**What it does:** ~4,000 small white points at opacity 0.18 drifting in a loose
sphere formation. Reads as "neural network" or "constellation" — intelligence,
not chaos.

```tsx
import { Canvas, useFrame } from "@react-three/fiber"
import { Points, PointMaterial } from "@react-three/drei"
import * as THREE from "three"
import { useRef, useMemo } from "react"

function ParticleField() {
  const ref = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const arr = new Float32Array(4000 * 3)
    for (let i = 0; i < 4000; i++) {
      const r = 2.5 + Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.015
  })

  return (
    <Points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <PointMaterial
        size={0.006}
        color="#F0F2F5"
        opacity={0.18}
        transparent
        sizeAttenuation
        depthWrite={false}
      />
    </Points>
  )
}

// In your hero:
const Scene = dynamic(
  () => import("@react-three/fiber").then(m => { /* wrap */ }),
  { ssr: false }
)
```

Key constraints: `rotation.y += delta * 0.015` — imperceptibly slow. No glow,
no connecting lines, no color, no bloom post-processing. The moment it starts
to glow it becomes a crypto casino.

Install: `npm install @react-three/fiber @react-three/drei three`

---

### Spline — Use for One Thing Only (if at all)

Spline (`@splinetool/react-spline`) adds 2–5MB and meaningful GPU overhead.
If you use it, use it for exactly one element: a small decorative 3D mark in the
header (e.g., an abstract geometric logo companion, not a background).

Community scenes worth inspecting (open in Spline editor, check color + performance):
- Abstract Shapes (CC0): `community.spline.design/file/035d65ab-4a23-4e0e-b291-897ea46f08f3`
- Abstract Crypto Scene (CC0): `community.spline.design/file/1c406718-0bc2-4d6d-aec9-27f53279221a`

Before using any community scene: open it in the Spline editor, recolor to the
Meridian palette, confirm the scene polygon count is under 50K, then export as
a static scene (not runtime). Load via `next/dynamic` with `ssr: false`.

**When NOT to use Spline:** background fills, anything that covers significant
viewport area, or any scene with particle emitters or neon glow materials.

---

### The Casino Blacklist — Never Use These

| Pattern | Why it kills trust |
|---|---|
| Spinning 3D ETH/token coin | Single most common DeFi casino signal |
| Neon glow / bloom at high intensity | Every rug-pull protocol uses this |
| Laser grid / synthwave floor | Web3 cliché, zero institutional credibility |
| Particle explosions / orbital emitters | Gamification signal |
| Plasma / kaleidoscope / fractal shaders | decorative chaos, no semantic meaning |
| 3D extruded bar charts | Destroys data legibility, signals bad judgment |
| Scrolling price ticker marquees | Exchange / trading app pattern |
| Dark purple-to-pink gradient background | The NFT marketplace aesthetic |
| Confetti on deposit success | This is a vault, not a slot machine |

---

## Color Palette

### Surfaces
```
--color-bg:          #0A0D12   /* primary background — near-black with blue undertone, NOT pure black */
--color-surface:     #111620   /* card / panel background */
--color-surface-2:   #1A2030   /* elevated surface: modals, dropdowns, sidebar */
--color-border:      #222D40   /* dividers, card outlines */
--color-border-2:    #2A3550   /* focused / hover borders */
```

### Text
```
--color-text:        #F0F2F5   /* primary — off-white, not pure white */
--color-text-2:      #8A95A8   /* secondary: labels, metadata */
--color-text-muted:  #505A6E   /* placeholder, disabled */
```

### Primary — Mantle Blue (interactive elements)
```
--color-primary:     #3B82F6
--color-primary-hover: #2563EB
--color-primary-deep: #1D4ED8
```

### Yield Green (positive APY, gains, earned yield ONLY)
```
--color-yield:       #10B981   /* emerald — trustworthy, NOT neon lime */
--color-yield-hover: #059669
--color-yield-bg:    #052e16   /* subtle green tint for positive stat backgrounds */
```

### AI Accent — Violet (used ONLY for AI decision log entries)
```
--color-ai:          #7C3AED
--color-ai-hover:    #8B5CF6
--color-ai-bg:       #1e1030   /* left-border tint on decision cards */
```

### Semantic
```
--color-error:       #EF4444
--color-warning:     #F59E0B
--color-neutral:     #6B7280
```

### Strategy Colors (allocation chart only)
```
cmETH strategy:      #3B82F6   /* blue */
Aave strategy:       #10B981   /* green */
USDY strategy:       #F59E0B   /* amber */
Idle:                #374151   /* dark gray */
```

**Rules:**
- These four strategy colors are reserved for the allocation bar/chart. Do not reuse them decoratively.
- The AI violet `#7C3AED` appears only on AI decision log entries — left border accent + timestamp label. Nowhere else.
- Do not introduce additional accent colors. Colorful interfaces feel like casinos.

---

## Typography

### Fonts
```css
/* Interface: Inter (tabular numerals enabled globally) */
font-family: 'Inter', system-ui, -apple-system, sans-serif;
font-feature-settings: "tnum";   /* tabular numbers — ALL numeric displays */

/* Monospace: Geist Mono (addresses, tx hashes, CIDs) */
font-family: 'Geist Mono', 'JetBrains Mono', monospace;
```

### Scale
```
Hero number (vault TVL, portfolio balance):  2.5rem / 700
Section header:                              1.25rem / 600
Card title / stat label:                     0.875rem / 500  (uppercase + 0.05em tracking)
Body:                                        0.875rem / 400
APY value:                                   1.5rem  / 600   (yield green)
Small / metadata:                            0.75rem / 400   (text-2 color)
Monospace (address, hash):                   0.75rem / 400   (Geist Mono)
```

### Number formatting rules
- All financial numbers: tabular numerals, right-aligned in columns
- mETH values: always 4 decimal places (`1.2345 mETH`)
- Percentages: always 2 decimal places (`3.50%`)
- USD estimates: 2 decimal places with comma separator (`$1,234.56`)
- Large TVL: abbreviated with unit (`14.6M mETH`, not `14600000`)
- Timestamps: relative for recent (`4h 23m ago`), absolute for old (`Jun 12, 2026 14:30`)

---

## Layout

### Page structure
```
┌─────────────────────────────────────────────────────────┐
│  HEADER: Logo | Nav (Dashboard · Deposit · Decisions)    │
│          right: ConnectWallet button                     │
├──────────┬──────────────────────────────────────────────┤
│ (optional│  PAGE CONTENT                                 │
│  sidebar)│  - max-width: 1200px, centered, px-6          │
│          │  - 24px gap between sections                  │
└──────────┴──────────────────────────────────────────────┘
```

### Card anatomy
Every stat card follows the same internal hierarchy:
```
┌─────────────────────────────────┐
│  LABEL (0.75rem, uppercase, muted)
│
│  VALUE  (dominant number — one per card, 1.5–2.5rem)
│
│  SUBTEXT (delta, source, timestamp — 0.75rem, muted)
└─────────────────────────────────┘
```
One dominant number per card. No visual tie for importance. Padding: 20px.
Border: 1px solid `--color-border`. Border-radius: 8px.

### Grid
- Stats row: 3-column grid on desktop, 1-column on mobile
- Strategy table: full-width, no horizontal scroll on desktop
- Decision log: single-column feed

---

## Component Specifications

### Vault Stats Bar (top of Dashboard)
Three cards side-by-side:

| Card | Dominant number | Subtext |
|---|---|---|
| Total Value Locked | X.XXXX mETH | "≈ $X,XXX · updated 12s ago" |
| Current APY | X.XX% | "7-day avg · AI-optimized" |
| AI vs Passive Hold | +XX bps | "since inception · view log →" |

The "AI vs Passive Hold" number uses `--color-yield` when positive, `--color-error`
when negative. This is the headline proof-of-value metric for judges.

### Strategy Allocation Bar
A horizontal segmented bar, not a pie chart. Three colored segments + idle.

```
cmETH ████████████████░░░░░░░░░░░░ 52%   Aave ████████░░░░ 28%   USDY █████░░░ 17%   Idle 3%
```

Below the bar: a small table with columns:
`Strategy | Balance (mETH) | APY | Allocation | Status`

All numbers right-aligned. APY column in `--color-yield`. Status badge:
- `ACTIVE` — green pill
- `DEPLOYING` — blue pill with spinner
- `IDLE` — gray pill

### Last Rebalanced indicator
Always visible near the allocation bar:
```
⟳  Last rebalanced  4h 23m ago   ·   Next window: 32m   ·   View tx →
```
Small text, `--color-text-2`. This answers "is this thing working?"

### Yield Accrual Ticker
On the deposit page, for connected users with a balance:

```
Earning now
0.000042  mETH/hr
```

The number updates on each new block. Even tiny numbers growing upward are the
most psychologically effective trust signal a yield product has.

### AI Decision Log Card
One card per `DecisionRecorded` event, newest first.

```
┌─╔══════════════════════════════════════════════════════╗
│ ║  [AI]  Jun 12 14:32 UTC  ·  NORMAL mode              ║  ← violet left border
│ ║                                                       ║
│ ║  Allocation change                                    ║
│ ║  cmETH  45% → 52%  (+7%)   ▲                         ║
│ ║  Aave   35% → 28%  (-7%)   ▼                         ║
│ ║  USDY   17% → 17%  (—)                               ║
│ ║                                                       ║
│ ║  AI Reasoning                                         ║
│ ║  "USDY sleeve retained at 17% on stable T-bill        ║
│ ║   yield. cmETH favored: +$120k smart-money inflow     ║
│ ║   (Nansen) and no swap/peg risk vs Aave. Aave         ║
│ ║   trimmed: WETH borrow rates compressing margin."     ║
│ ║                                                       ║
│ ║  Performance: +47 bps vs passive hold                 ║
│ ║                                                       ║
│ ║  [IPFS ↗] bafybei...4cXA   [On-chain ↗] 0x8a3f...    ║
└─╚══════════════════════════════════════════════════════╝
```

- Left border: 3px solid `--color-ai` (#7C3AED)
- Background: `--color-surface` with a subtle `--color-ai-bg` tint
- The IPFS and on-chain links are the transparency proof — make them visible
- Skeleton state while IPFS blob fetches: pulsing gray blocks at the reasoning text position

### Connect Wallet Button
- Disconnected: `Connect Wallet` — outlined button, `--color-primary` border + text
- Connected: shows truncated address (`0x640C...7911`) + MNT balance, green dot

### Transaction States
After any deposit/withdraw/approve:
- Pending: spinning icon + "Waiting for confirmation..."
- Success: checkmark + "Transaction confirmed" + Mantlescan link
- Error: red X + specific error message (e.g., "Insufficient mETH balance")
No confetti. No celebrations. A quiet confirmation is correct.

---

## Trust Architecture

These elements must appear above the fold — treat them as design features, not
fine print or footer content.

### Security bar (below the header or above the deposit form)
```
🛡 Audited   ·   Contracts verified on Mantlescan   ·   Non-custodial   ·   Max 70% per strategy
```
Small text, `--color-text-muted`. The constraints (cooldown, caps) are safety rails —
display them as features.

### Guard rail indicators (on the deposit / vault page)
```
Strategy caps:   cmETH max 60%   ·   Aave max 60%   ·   USDY max 50%
Rebalance cooldown:  1h between rebalances
Keeper powers:   Rebalance only — cannot withdraw funds
```
These limits signal disciplined design. They reduce fear.

### Pre-wallet state
Before a user connects their wallet, the Dashboard and Decisions pages should
display live read-only data: vault TVL, current allocation, last decision, APY.
Do not show a blank screen with only "Connect Wallet."
The machine should be visibly working before any money is at stake.

---

## What NOT to Build

| Pattern | Why |
|---|---|
| Neon lime / yellow-green APY numbers | Casino signal. Use `#10B981` only. |
| Animated gradient backgrounds / aurora blobs | Every low-trust protocol uses these. Meridian's background is flat `#0A0D12`. |
| Unlabeled APY numbers | Always show timeframe ("7-day avg") and source. Naked yield numbers are a red flag. |
| Confetti / success celebrations | Use a quiet checkmark. Confetti is for gaming apps. |
| Multiple decorative accent colors | Three semantic colors maximum. Extra colors = visual noise. |
| Pie chart for allocation | Horizontal segmented bar is more scannable and feels more controlled. |
| "Powered by AI" marketing badge | Let the decision log speak. A live feed of verifiable AI decisions is the proof. |
| Hamburger menu on desktop | Signals mobile-first afterthought. |
| Bright white (#FFFFFF) backgrounds | Wrong audience. Dark is correct for crypto-native mETH depositors. |
| Hiding the AI layer as a footnote | It's the product's differentiation — surface it through the decision log, not marketing copy. |

---

## Page-by-Page Checklist

### Dashboard (`/dashboard`)
- [ ] Vault stats bar (TVL, APY, AI vs Passive Hold)
- [ ] Strategy allocation bar (horizontal, 4 segments, labeled)
- [ ] Per-strategy table (balance, APY, allocation%, status badge)
- [ ] Last rebalanced / next window indicator
- [ ] Recent rebalances list (last 5, with tx links)
- [ ] Link to Decision Log ("View full AI reasoning →")
- [ ] All data visible pre-wallet-connect

### Deposit (`/deposit`)
- [ ] Tab switcher: Deposit | Withdraw
- [ ] mETH balance display (live)
- [ ] mvmETH balance + current value in mETH
- [ ] Share price (mETH per share)
- [ ] Yield accrual ticker (when connected + balance > 0)
- [ ] Approve → Deposit flow with clear state feedback
- [ ] previewRedeem shows estimated mETH out before withdraw
- [ ] Security bar above the form
- [ ] Guard rail indicators

### Decision Log (`/decisions`)
- [ ] Page header with one-line explanation of transparency model
- [ ] Decision cards, newest first, with violet left border
- [ ] AI reasoning text (from IPFS)
- [ ] Allocation delta table per card
- [ ] perfDeltaBps (AI vs passive hold)
- [ ] IPFS link + Mantlescan tx link on every card
- [ ] Skeleton loading while IPFS blobs fetch
- [ ] Empty state: "No decisions yet — keeper runs every hour"

---

## shadcn/ui Component Map

| UI element | shadcn component |
|---|---|
| Stat cards | `Card`, `CardHeader`, `CardContent` |
| Strategy table | `Table`, `TableRow`, `TableCell` |
| Status badges | `Badge` (variant: default/secondary/outline) |
| Tab switcher | `Tabs`, `TabsList`, `TabsTrigger` |
| Input fields | `Input` |
| Buttons | `Button` (variant: default / outline / ghost) |
| Loading states | `Skeleton` |
| Toast notifications | `Sonner` (or `useToast`) |
| Tooltips | `Tooltip` |
| Decision card | `Card` with custom left-border via className |

Override shadcn defaults with the palette above. The default shadcn theme will not
match — replace all `--primary`, `--background`, `--card`, `--border` CSS vars in
`globals.css` to match the palette at the top of this document.

---

## Implementation Notes for Session 7

1. **Install fonts early:**
   ```bash
   # In layout.tsx — use next/font
   import { Inter } from 'next/font/google'
   const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
   ```
   Add `font-feature-settings: "tnum"` to `body` in `globals.css`.

2. **Override shadcn CSS vars in `globals.css`:**
   Replace `:root` and `.dark` blocks with the palette above. Do this before
   building any components.

3. **Recharts for allocation bar:**
   Use `BarChart` in horizontal layout, or a simple custom CSS flex bar.
   The CSS flex bar is actually cleaner and more controllable:
   ```tsx
   <div className="flex h-4 rounded overflow-hidden">
     <div style={{ width: `${cmethPct}%`, background: '#3B82F6' }} />
     <div style={{ width: `${aavePct}%`, background: '#10B981' }} />
     <div style={{ width: `${usdyPct}%`, background: '#F59E0B' }} />
     <div style={{ width: `${idlePct}%`, background: '#374151' }} />
   </div>
   ```

4. **Tabular numbers globally:**
   ```css
   /* globals.css */
   [class*="text-"] { font-feature-settings: "tnum" 1; }
   ```
   Or add `tabular-nums` Tailwind class to every `<span>` displaying a number.

5. **Skeleton states for IPFS fetches:**
   Decision log cards should render immediately with skeleton blocks in the
   reasoning text area while the IPFS fetch completes. Never show a blank card.
