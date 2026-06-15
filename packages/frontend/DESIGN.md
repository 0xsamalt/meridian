---
version: "meridian-terminal-2026-06-14"
name: "Meridian Design System"
description: "Terminal-native dark product UI for Meridian — AI-managed ERC-4626 yield vault on Mantle. Precision-engineered, data-first, low-decoration. References: EigenLayer, Hyperliquid."
register: product
colors:
  primary: "#3B82F6"
  accent: "#93C5FD"
  background: "#0A0E14"
  surface: "#12161F"
  surface-raised: "#1A1F2B"
  border: "rgba(255,255,255,0.08)"
  border-hover: "rgba(255,255,255,0.16)"
  text-primary: "#F5F7FA"
  text-secondary: "#9CA3AF"
  text-tertiary: "#6B7280"
  success: "#34D399"
  warning: "#FBBF24"
  danger: "#F87171"
typography:
  display:
    fontFamily: "Inter"
    fontSize: "60px"
    fontWeight: 600
    lineHeight: "1.06"
    letterSpacing: "-0.02em"
  heading-lg:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "1.3"
  heading-md:
    fontFamily: "Inter"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "1.4"
  body-md:
    fontFamily: "Inter"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "1.6"
  body-sm:
    fontFamily: "Inter"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.5"
  label-mono:
    fontFamily: "JetBrains Mono"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "1.2"
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  data-lg:
    fontFamily: "Inter"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: "1.1"
  data-md:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "1.2"
spacing:
  base: "8px"
  gap-card: "16px"
  card-padding: "20px"
  section-padding-landing: "80px"
rounded:
  card: "16px"
  control: "8px"
  pill: "9999px"
---

# Meridian Design System

Terminal-native dark product UI. Design SERVES the vault. Data is the hero. Every visual decision should make the numbers and AI decisions clearer, not compete with them.

**Reference aesthetic:** EigenLayer, Hyperliquid — precision-engineered, monospace data labels, low-glow dark surfaces, functional and serious.

**Anti-references (never do):**
- Generic shadcn/Tailwind template output
- Neon/cyberpunk crypto glows or gradient borders
- Centered h1 + blob + CTA SaaS hero template
- Excessive particle effects or animations competing with content

---

## Colors

Dark mode only. No light mode variant.

| Token | Value | Role |
|-------|-------|------|
| `meridian-bg` | `#0A0E14` | Page background |
| `meridian-surface` | `#12161F` | Card / panel background |
| `meridian-surface-raised` | `#1A1F2B` | Elevated surface, nested elements |
| `meridian-border` | `rgba(255,255,255,0.08)` | All borders, dividers |
| `meridian-border-hover` | `rgba(255,255,255,0.16)` | Hovered interactive card borders |
| `meridian-blue` | `#3B82F6` | Primary actions, active nav, links |
| `meridian-blue-dim` | `#1E3A6E` | Blue surface tint (very subtle) |
| `meridian-blue-light` | `#93C5FD` | Accent, left ring of logo, light allocation |
| `meridian-text-primary` | `#F5F7FA` | Primary content |
| `meridian-text-secondary` | `#9CA3AF` | Labels, supporting text |
| `meridian-text-tertiary` | `#6B7280` | Timestamps, metadata, placeholders |
| `meridian-success` | `#34D399` | Positive delta, live signals |
| `meridian-warning` | `#FBBF24` | Stale signals |
| `meridian-danger` | `#F87171` | Negative delta, errors |

## Typography

Two families only:
- **Inter** — all UI text, headings, body, data numbers
- **JetBrains Mono** — addresses, CIDs, tx hashes, technical labels, nav links, strategy keys

### Scale

| Role | Family | Size | Weight | Notes |
|------|---------|------|--------|-------|
| Display (landing hero) | Inter | 60px | 600 | `-0.02em` letter-spacing, tight leading 1.06 |
| Heading LG (page titles) | Inter | 24px | 600 | |
| Heading MD (card titles) | Inter | 18px | 600 | |
| Body MD | Inter | 15px | 400 | Line-height 1.6, max 65ch |
| Body SM | Inter | 13px | 400 | |
| Label Mono | JetBrains Mono | 11px | 500 | Uppercase, 0.06em tracking — addresses, keys, nav |
| Data LG (TVL) | Inter | 40px | 600 | Tabular nums |
| Data MD (share price, stats) | Inter | 24px | 600 | Tabular nums |

## Layout

### Landing page sections

1. **Hero** — full viewport, left-aligned, ambient SVG ring layer behind text
2. **Stats bar** — `border-t border-b border-meridian-border`, 3 columns, no cards, just a strip
3. **Feature bento** — mixed 2-col + 1-col + 1-col card grid
4. **CTA strip** — full-width, centered, single action

### Dashboard bento grid

```
[ TVL (2-col wide)              ] [ Share Price (1-col) ]
[ Allocation (2-col)            ] [ Keeper Status (1-col) ]
[ Keeper Activity Feed (3-col full width)                 ]
```

TVL card: `data-lg` (40px) number, very subtle radial gradient behind (`rgba(59,130,246,0.04) at bottom`).
Keeper Status card: shows countdown in `font-mono text-[28px]`, active/paused state.

### App pages (deposit, decisions)

Max content width: `1080px`. Card padding: `20px`. Gap: `16px`.

## Components

### Cards

```
background: meridian-surface (#12161F)
border: 1px solid meridian-border (rgba(255,255,255,0.08))
border-radius: 16px (card)
padding: 20px
shadow: none — separation via contrast + border only
```

**Interactive cards (landing feature bento):**
```
hover: border → meridian-border-hover (rgba(255,255,255,0.16))
hover: transform → translateY(-2px)
transition: border-color 150ms ease-out, transform 200ms ease-out
```

### Buttons

| Variant | Style |
|---------|-------|
| Primary | `bg-meridian-blue text-white` rounded-control (8px), `hover:bg-[#2563EB]` |
| Ghost | `border border-meridian-border text-meridian-text-secondary hover:border-meridian-border-hover hover:text-meridian-text-primary` |
| Link | `text-meridian-blue hover:text-meridian-blue-light` |

### Navigation active state

`border-b-2 border-meridian-blue text-meridian-text-primary`
NOT a background pill. Never `bg-accent` or `bg-primary`.

### Tabs (deposit page)

Active tab: `border-b-2 border-meridian-blue text-meridian-text-primary`
Inactive: `text-meridian-text-secondary hover:text-meridian-text-primary`
NO background fill on tab trigger.

### Allocation bars

Height: `10px` (not 6px). Rounded full. Fill animates on mount: `transition-[width] duration-700 ease-out`.

### Badges / pills

`font-mono text-[11px] uppercase tracking-widest rounded-pill px-2 py-0.5`
Borders only — no fill backgrounds on neutral badges.

### Data display

- All numbers: `font-variant-numeric: tabular-nums`
- Addresses / CIDs: `font-mono bg-meridian-surface-raised px-2 py-0.5 rounded-md text-[11px]` — mono pill
- Signal status dots: `●` unicode in `text-meridian-success` or `text-meridian-warning`

## Motion

**Duration scale:**
- Micro (hover border, color): `150ms ease-out`
- Standard (card lift, tab switch): `200ms ease-out`
- Reveal (masked headline, bento stagger): `350-450ms cubic-bezier(0.16, 1, 0.3, 1)`
- Data fill (allocation bars): `700ms ease-out`

**Stagger:** 50-80ms between sibling cards.

**Always provide `@media (prefers-reduced-motion: reduce)` alternative** — typically instant transition.

**No bounce. No elastic. No spring physics.**

### Landing hero ambient layer

Two SVG circle rings (`cx/cy` offset for the dual-ring motif):
- Left ring: `stroke: #93C5FD`, `opacity: 0.06`, slow clockwise rotation — `animation: ring-spin-slow 40s linear infinite`
- Right ring: `stroke: #3B82F6`, `opacity: 0.06`, slow counter-clockwise — `animation: ring-spin-slow 55s linear infinite reverse`
- Size: fill the viewport height roughly, positioned `absolute inset-0` behind content
- Reduced motion: `animation: none`, rings render statically at same opacity

## Score bars (Decisions page)

Replace recharts `<BarChart>` with custom CSS:
```tsx
<div className="h-2 w-full rounded-full bg-meridian-surface-raised">
  <div
    className="h-full rounded-full transition-[width] duration-500"
    style={{ width: `${normalizedScore}%`, background: STRATEGY_COLORS[key] }}
  />
</div>
```
No library dependency. Consistent with allocation bar visual language.

## Guardrails

- Never use `bg-accent` (#93C5FD) as a background fill on nav items, tabs, or buttons
- Never use gradient text (`background-clip: text`)
- Never use `border-left` thick colored accent stripes
- Never render identical-size card grids — vary spans by content importance
- Dashboard pages: no ambient animation layers (landing only)
- JetBrains Mono for labels/data keys/addresses; Inter for all prose, headings, and interactive labels
