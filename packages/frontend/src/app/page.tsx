'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

// ── Docs data ─────────────────────────────────────────────────────────────────

const GITHUB = 'https://github.com/0xsamalt/meridian/blob/master/docs'

const DOCS = [
  {
    tag: 'ARCHITECTURE.md',
    title: 'Architecture',
    description: 'System overview, keeper flow, ERC-8004 agent integration, and the design decisions behind every non-obvious choice.',
    url: `${GITHUB}/ARCHITECTURE.md`,
  },
  {
    tag: 'CONTRACTS.md',
    title: 'Smart Contracts',
    description: 'Full interface specs, storage layout, rebalance logic, and security invariants for VaultCore, strategies, and MeridianRegistry.',
    url: `${GITHUB}/CONTRACTS.md`,
  },
  {
    tag: 'KEEPER.md',
    title: 'Keeper',
    description: 'Off-chain AI keeper: signal pipeline (Nansen + Elfa), allocation engine, IPFS pinning, and on-chain submission cycle.',
    url: `${GITHUB}/KEEPER.md`,
  },
  {
    tag: 'RISKS.md',
    title: 'Risk Model',
    description: 'Threat model with P0–P3 priorities — keeper key compromise, price manipulation, reentrancy, depeg, and more.',
    url: `${GITHUB}/RISKS.md`,
  },
]

// ── Feature bento data ────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'keeper',
    span: 'lg:col-span-2',
    tag: 'AI Keeper',
    headline: 'Rebalances every hour.',
    body: 'The keeper reads Nansen on-chain flows and Elfa social signals, scores three strategies, and moves capital to the highest-risk-adjusted yield. No human intervention. No manual triggers.',
    visual: 'allocation',
  },
  {
    id: 'proof',
    span: 'lg:col-span-1',
    tag: 'On-chain proof',
    headline: 'Every decision is verifiable.',
    body: 'Reasoning is hashed, pinned to IPFS, and anchored on-chain via ERC-8004. You can verify any rebalance without trusting the keeper.',
    visual: 'cid',
  },
  {
    id: 'strategies',
    span: 'lg:col-span-1',
    tag: 'Three strategies',
    headline: 'Diversified by design.',
    body: 'cmETH liquid staking · Aave V3 lending · USDY stablecoin yield. Max 70% per strategy. 1h rebalance cooldown. Non-custodial.',
    visual: 'strategies',
  },
]

const STRATEGY_BARS = [
  { label: 'cmETH', pct: 48, color: '#3B82F6' },
  { label: 'Aave',  pct: 32, color: '#185FA5' },
  { label: 'USDY',  pct: 12, color: '#93C5FD' },
  { label: 'Idle',  pct: 8,  color: '#374151' },
]

// ── Motion variants ────────────────────────────────────────────────────────────

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

const sectionReveal = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } },
}

const staggerContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 22 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
}

// ── Ambient ring visual ───────────────────────────────────────────────────────

function AmbientRings() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">

      {/* Radial glow — soft halo centred on the ring origin */}
      <div
        className="absolute right-0 top-1/2 h-[1000px] w-[1000px] -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(147,197,253,0.05) 28%, transparent 62%)',
        }}
      />

      {/* Ring group A — counter-clockwise, slow (90s) — uses CSS class for reduced-motion support */}
      <div className="ring-spin-a absolute right-0 top-1/2 h-[1000px] w-[1000px] -translate-y-1/2">
        <svg
          viewBox="0 0 1000 1000"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          {/* Outermost solid ring */}
          <circle cx="500" cy="500" r="460" stroke="#3B82F6"  strokeWidth="1"    strokeOpacity="0.18" />
          {/* Dashed accent ring */}
          <circle cx="500" cy="500" r="375" stroke="#93C5FD"  strokeWidth="1.5"  strokeOpacity="0.24" strokeDasharray="6 14" />
          {/* Middle solid rings */}
          <circle cx="500" cy="500" r="275" stroke="#3B82F6"  strokeWidth="1"    strokeOpacity="0.30" />
          <circle cx="500" cy="500" r="175" stroke="#93C5FD"  strokeWidth="1.5"  strokeOpacity="0.32" />
          {/* Inner ring */}
          <circle cx="500" cy="500" r="82"  stroke="#3B82F6"  strokeWidth="2"    strokeOpacity="0.38" />
          {/* Centre dot */}
          <circle cx="500" cy="500" r="5"   fill="#3B82F6"    fillOpacity="0.60" />
          {/* Cardinal node markers on the 375-ring */}
          <circle cx="500" cy="125" r="3.5" fill="#93C5FD" fillOpacity="0.40" />
          <circle cx="875" cy="500" r="3.5" fill="#93C5FD" fillOpacity="0.40" />
          <circle cx="500" cy="875" r="3.5" fill="#93C5FD" fillOpacity="0.40" />
          <circle cx="125" cy="500" r="3.5" fill="#93C5FD" fillOpacity="0.40" />
        </svg>
      </div>

      {/* Ring group B — clockwise, slightly faster (55s) with orbiting dots */}
      <div className="ring-spin-b absolute right-0 top-1/2 h-[1000px] w-[1000px] -translate-y-1/2">
        <svg
          viewBox="0 0 1000 1000"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          <circle cx="500" cy="500" r="418" stroke="#93C5FD"  strokeWidth="0.75" strokeOpacity="0.14" />
          <circle cx="500" cy="500" r="325" stroke="#3B82F6"  strokeWidth="1"    strokeOpacity="0.20" />
          <circle cx="500" cy="500" r="225" stroke="#93C5FD"  strokeWidth="0.75" strokeOpacity="0.24" strokeDasharray="3 10" />
          <circle cx="500" cy="500" r="128" stroke="#3B82F6"  strokeWidth="1"    strokeOpacity="0.27" />
          {/* Orbiting satellite dots — appear to travel with the ring group */}
          <circle cx="500" cy="175"  r="5"   fill="#3B82F6" fillOpacity="0.70" />
          <circle cx="500" cy="275"  r="3"   fill="#93C5FD" fillOpacity="0.55" />
          <circle cx="500" cy="372"  r="2"   fill="#3B82F6" fillOpacity="0.40" />
        </svg>
      </div>

    </div>
  )
}

// ── Feature visuals ────────────────────────────────────────────────────────────

function AllocationVisual() {
  return (
    <div className="mt-5 space-y-2.5">
      {STRATEGY_BARS.map((bar) => (
        <div key={bar.label}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
              {bar.label}
            </span>
            <span className="tabular-nums font-mono text-[11px] text-meridian-text-secondary">
              {bar.pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-meridian-surface-raised">
            <div
              className="h-full rounded-full"
              style={{ width: `${bar.pct}%`, background: bar.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function CidVisual() {
  return (
    <div className="mt-5 space-y-2">
      <div className="rounded-md border border-meridian-border bg-meridian-surface-raised px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
          IPFS CID
        </p>
        <p className="mt-1 truncate font-mono text-[11px] text-meridian-text-secondary">
          bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
        </p>
      </div>
      <div className="rounded-md border border-meridian-border bg-meridian-surface-raised px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
          On-chain hash
        </p>
        <p className="mt-1 truncate font-mono text-[11px] text-meridian-text-secondary">
          0x3f9a…e84c
        </p>
      </div>
    </div>
  )
}

function StrategiesVisual() {
  const strategies = [
    { key: 'cmETH', desc: 'Liquid staking', color: '#3B82F6' },
    { key: 'Aave',  desc: 'V3 lending',     color: '#185FA5' },
    { key: 'USDY',  desc: 'Stable yield',   color: '#93C5FD' },
  ]
  return (
    <div className="mt-5 space-y-2">
      {strategies.map((s) => (
        <div
          key={s.key}
          className="flex items-center gap-3 rounded-md border border-meridian-border bg-meridian-surface-raised px-3 py-2"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-primary">
            {s.key}
          </span>
          <span className="text-[12px] text-meridian-text-tertiary">{s.desc}</span>
        </div>
      ))}
    </div>
  )
}

// ── External arrow icon ───────────────────────────────────────────────────────

function ArrowExternal() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 12 12"
      fill="none"
      className="mt-0.5 shrink-0 text-meridian-text-tertiary transition-colors group-hover:text-meridian-blue-light"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5h5v5M9.5 2.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <AmbientRings />

        <div className="relative mx-auto max-w-[1200px] px-6 pb-32 pt-24 lg:pb-44 lg:pt-32">

          {/* Technical context label — first to arrive */}
          <p className="mb-6 animate-fade-in [animation-delay:0ms] [animation-fill-mode:both] font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
            ERC-4626 · Mantle Network · Keeper v1
          </p>

          {/* Headline */}
          <h1 className="max-w-[640px] animate-fade-in [animation-delay:120ms] [animation-duration:500ms] [animation-fill-mode:both] text-[clamp(40px,5vw,60px)] font-semibold leading-[1.06] tracking-[-0.02em] text-meridian-text-primary [text-wrap:balance]">
            AI-managed yield.
            <br />
            Every decision on-chain.
          </h1>

          {/* Sub-headline */}
          <p className="mt-6 max-w-[480px] animate-fade-in [animation-delay:240ms] [animation-duration:500ms] [animation-fill-mode:both] text-[15px] leading-relaxed text-meridian-text-secondary">
            Meridian routes your mETH across cmETH, Aave V3, and USDY. The keeper
            rebalances hourly — reasoning hashed, pinned to IPFS, anchored on Mantle.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex animate-fade-in flex-wrap items-center gap-4 [animation-delay:360ms] [animation-duration:500ms] [animation-fill-mode:both]">
            <Link
              href="/deposit"
              className="inline-flex items-center justify-center rounded-control bg-meridian-blue px-6 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meridian-blue"
            >
              Deposit mETH
            </Link>
            <Link
              href="/decisions"
              className="inline-flex items-center gap-1.5 text-[14px] text-meridian-text-secondary transition-colors hover:text-meridian-text-primary"
            >
              View AI decision log
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats bar — fade in on scroll ── */}
      <motion.div
        className="border-b border-t border-meridian-border"
        variants={sectionReveal}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.6 }}
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-3 divide-x divide-meridian-border px-6">
          {[
            { label: 'Vault type',  value: 'ERC-4626' },
            { label: 'Network',     value: 'Mantle'   },
            { label: 'Strategies',  value: '3 active' },
          ].map(({ label, value }) => (
            <div key={label} className="px-8 py-5 first:pl-0 last:pr-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
                {label}
              </p>
              <p className="mt-1 font-mono text-[15px] font-medium text-meridian-text-primary">
                {value}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Feature bento — stagger on scroll ── */}
      <section className="mx-auto max-w-[1200px] px-6 py-20">
        <motion.div
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.12 }}
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.id}
              variants={cardVariant}
              className={`group flex flex-col rounded-card border border-meridian-border bg-meridian-surface p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-meridian-border-hover ${f.span}`}
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
                {f.tag}
              </p>
              <h2 className="mt-3 text-[18px] font-semibold leading-tight text-meridian-text-primary">
                {f.headline}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-meridian-text-secondary">
                {f.body}
              </p>
              {f.visual === 'allocation' && <AllocationVisual />}
              {f.visual === 'cid'        && <CidVisual />}
              {f.visual === 'strategies' && <StrategiesVisual />}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Docs ── */}
      <section className="border-t border-meridian-border">
        <div className="mx-auto max-w-[1200px] px-6 py-20">

          {/* Section header */}
          <motion.div
            className="mb-10"
            variants={sectionReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.5 }}
          >
            <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
              Open source
            </p>
            <h2 className="text-[28px] font-semibold leading-tight text-meridian-text-primary">
              Documentation
            </h2>
            <p className="mt-2 max-w-[480px] text-[14px] leading-relaxed text-meridian-text-secondary">
              The full technical spec is public on GitHub — architecture, contracts,
              keeper logic, and the risk model.
            </p>
          </motion.div>

          {/* Doc cards — stagger */}
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
          >
            {DOCS.map((doc) => (
              <motion.a
                key={doc.tag}
                variants={cardVariant}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-card border border-meridian-border bg-meridian-surface p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-meridian-border-hover"
              >
                {/* File tag */}
                <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
                  {doc.tag}
                </p>

                {/* Title + external arrow */}
                <div className="mt-3 flex items-start justify-between gap-2">
                  <h3 className="text-[16px] font-semibold leading-tight text-meridian-text-primary">
                    {doc.title}
                  </h3>
                  <ArrowExternal />
                </div>

                {/* Description */}
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-meridian-text-secondary">
                  {doc.description}
                </p>

                {/* Footer link label */}
                <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-meridian-blue transition-colors group-hover:text-meridian-blue-light">
                  Read on GitHub ↗
                </p>
              </motion.a>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA strip ── */}
      <motion.section
        className="border-t border-meridian-border"
        variants={sectionReveal}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
            Non-custodial · Keeper cannot withdraw funds
          </p>
          <h2 className="mt-4 text-[28px] font-semibold leading-tight text-meridian-text-primary [text-wrap:balance]">
            Deposit mETH. Let the keeper work.
          </h2>
          <p className="mt-3 max-w-[400px] text-[14px] leading-relaxed text-meridian-text-secondary">
            Every rebalance is auditable. Every allocation is bounded. You can withdraw any time.
          </p>
          <Link
            href="/deposit"
            className="mt-8 inline-flex items-center justify-center rounded-control bg-meridian-blue px-8 py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meridian-blue"
          >
            Open vault
          </Link>
        </div>
      </motion.section>
    </>
  )
}
