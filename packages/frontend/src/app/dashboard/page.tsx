'use client'

import Link from 'next/link'
import {
  IconArrowRight,
  IconRefresh,
  IconCheck,
  IconExternalLink,
  IconPointFilled,
} from '@tabler/icons-react'
import { motion } from 'framer-motion'
import { useVaultState } from '@/hooks/useVaultState'
import { useDecisions, type Decision } from '@/hooks/useDecisions'
import { Skeleton } from '@/components/ui/skeleton'
import { fmt, fmtRelTime } from '@/lib/utils'
import { EXPLORER, REGISTRY_ADDRESS } from '@/lib/contracts'

// ── Motion ────────────────────────────────────────────────────────────────────

const CARD_EASE = [0.16, 1, 0.3, 1] as const

const cardVariant = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: CARD_EASE } },
}

const bentoStagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

// ── TVL card (2-col) ──────────────────────────────────────────────────────────

function TvlCard({
  totalAssets,
  idleMeth,
  loading,
}: {
  totalAssets: bigint
  idleMeth: bigint
  loading: boolean
}) {
  return (
    <motion.div variants={cardVariant} className="lg:col-span-2">
      <div
        className="relative overflow-hidden rounded-card border border-meridian-border bg-meridian-surface p-5"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 90% 110%, rgba(59,130,246,0.07) 0%, transparent 60%), #12161F',
        }}
      >
        {/* Label */}
        <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
          Total Value Locked
        </p>

        {/* Big number */}
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-12 w-44 bg-meridian-surface-raised" />
          ) : (
            <p className="tabular-nums text-[40px] font-semibold leading-none text-meridian-text-primary">
              {fmt(totalAssets, 4)}
              <span className="ml-2 text-[20px] font-normal text-meridian-text-tertiary">
                mETH
              </span>
            </p>
          )}
        </div>

        {/* Sub stats row */}
        <div className="mt-4 flex items-center gap-4 border-t border-meridian-border pt-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
              Idle buffer
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-4 w-20 bg-meridian-surface-raised" />
            ) : (
              <p className="mt-0.5 tabular-nums text-[13px] font-medium text-meridian-text-secondary">
                {fmt(idleMeth, 4)} mETH
              </p>
            )}
          </div>
          <div className="h-6 w-px bg-meridian-border" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
              Vault
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-meridian-text-secondary">
              ERC-4626
            </p>
          </div>
          <div className="h-6 w-px bg-meridian-border" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
              Network
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-meridian-text-secondary">
              Mantle
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Share price + AI delta card (1-col) ───────────────────────────────────────

function SharePriceCard({
  sharePrice,
  latestPerf,
  latestTimestamp,
  loading,
  perfLoading,
}: {
  sharePrice: bigint
  latestPerf: number | null
  latestTimestamp: number | null
  loading: boolean
  perfLoading: boolean
}) {
  const perfPositive = latestPerf !== null && latestPerf >= 0

  return (
    <motion.div variants={cardVariant} className="lg:col-span-1">
      <div className="flex h-full flex-col rounded-card border border-meridian-border bg-meridian-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
          Share Price
        </p>

        <div className="mt-3 flex-1">
          {loading ? (
            <Skeleton className="h-8 w-28 bg-meridian-surface-raised" />
          ) : (
            <p className="tabular-nums text-[28px] font-semibold leading-none text-meridian-text-primary">
              {fmt(sharePrice, 6)}
              <span className="ml-1.5 text-[13px] font-normal text-meridian-text-tertiary">
                mETH
              </span>
            </p>
          )}
          <p className="mt-1 text-[12px] text-meridian-text-tertiary">per mvmETH share</p>
        </div>

        {/* AI vs passive delta */}
        <div className="mt-4 rounded-md border border-meridian-border bg-meridian-surface-raised px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
            AI vs passive hold
          </p>
          {perfLoading ? (
            <Skeleton className="mt-1.5 h-5 w-16 bg-meridian-border" />
          ) : latestPerf === null ? (
            <p className="mt-1 text-[13px] text-meridian-text-tertiary">No data yet</p>
          ) : (
            <>
              <p
                className={`mt-0.5 tabular-nums text-[20px] font-semibold ${
                  perfPositive ? 'text-meridian-success' : 'text-meridian-danger'
                }`}
              >
                {perfPositive ? '+' : ''}
                {(latestPerf / 100).toFixed(2)}%
              </p>
              {latestTimestamp && (
                <p className="mt-0.5 text-[11px] text-meridian-text-tertiary">
                  since {fmtRelTime(latestTimestamp)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Allocation bars (2-col) ───────────────────────────────────────────────────

function AllocationCard({
  strategies,
  idleMeth,
  totalAssets,
  loading,
  latestDecision,
}: {
  strategies: ReturnType<typeof useVaultState>['strategies']
  idleMeth: bigint
  totalAssets: bigint
  loading: boolean
  latestDecision: Decision | null
}) {
  const targetBps = latestDecision?.reasoning?.decision?.targetBps ?? null

  const rows = targetBps
    ? [
        ...strategies.map((s) => ({
          label: s.label,
          pct: (targetBps[s.key] ?? 0) / 100,
          color: s.color,
        })),
        { label: 'Idle buffer', pct: (targetBps['idle'] ?? 0) / 100, color: '#374151' },
      ]
    : [
        ...strategies.map((s) => ({ label: s.label, pct: s.allocationPct, color: s.color })),
        {
          label: 'Idle buffer',
          pct: totalAssets > 0n ? Number((idleMeth * 10000n) / totalAssets) / 100 : 0,
          color: '#374151',
        },
      ]

  const cardLabel = targetBps ? 'Target Allocation' : 'Live Allocation'

  return (
    <motion.div variants={cardVariant} className="lg:col-span-2">
      <div className="rounded-card border border-meridian-border bg-meridian-surface p-5">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
            {cardLabel}
          </p>
          <span className="rounded-pill border border-meridian-border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
            3 strategies
          </span>
        </div>

        {/* Bars */}
        {!loading && totalAssets === 0n ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-[13px] text-meridian-text-tertiary">No assets deposited yet</p>
            <Link
              href="/deposit"
              className="mt-3 flex items-center gap-1 text-[13px] text-meridian-blue transition-colors hover:text-meridian-blue-light"
            >
              Deposit mETH
              <IconArrowRight className="h-3.5 w-3.5" stroke={2} />
            </Link>
          </div>
        ) : (
          <div className="space-y-3.5">
            {rows.map((row, i) => (
              <div key={row.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-secondary">
                    {row.label}
                  </span>
                  <span className="tabular-nums text-[12px] font-medium text-meridian-text-primary">
                    {loading ? '—' : `${row.pct.toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-meridian-surface-raised">
                  {!loading && (
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: row.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${row.pct}%` }}
                      transition={{
                        duration: 0.7,
                        ease: CARD_EASE,
                        delay: 0.3 + i * 0.06,
                      }}
                    />
                  )}
                  {loading && (
                    <Skeleton className="h-full w-full rounded-full bg-meridian-surface-raised" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer guardrails */}
        <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
          Max 70% / strategy · 1h cooldown · nonReentrant
        </p>
      </div>
    </motion.div>
  )
}

// ── Keeper status card (1-col) ────────────────────────────────────────────────

function KeeperStatusCard({
  nextRebalanceIn,
  isLoading,
}: {
  nextRebalanceIn: number | null
  isLoading: boolean
}) {
  function fmtCountdown(secs: number): string {
    if (secs <= 0) return 'Ready'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const isReady = nextRebalanceIn !== null && nextRebalanceIn <= 0
  const countdownStr =
    nextRebalanceIn === null ? '—' : fmtCountdown(nextRebalanceIn)

  return (
    <motion.div variants={cardVariant} className="lg:col-span-1">
      <div className="flex h-full flex-col rounded-card border border-meridian-border bg-meridian-surface p-5">

        {/* Status dot + label */}
        <div className="flex items-center gap-2">
          <IconPointFilled
            className={`h-3 w-3 ${isReady ? 'text-meridian-success' : 'text-meridian-blue'}`}
          />
          <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
            {isReady ? 'Keeper ready' : 'Keeper cooldown'}
          </p>
        </div>

        {/* Countdown */}
        <div className="mt-3 flex-1">
          {isLoading ? (
            <Skeleton className="h-10 w-24 bg-meridian-surface-raised" />
          ) : (
            <p className="font-mono tabular-nums text-[32px] font-medium leading-none text-meridian-text-primary">
              {countdownStr}
            </p>
          )}
          <p className="mt-1.5 text-[12px] text-meridian-text-tertiary">
            {nextRebalanceIn === null
              ? 'Waiting for first rebalance'
              : isReady
              ? 'Next rebalance can run now'
              : 'Until next rebalance window'}
          </p>
        </div>

        {/* Divider + CTA */}
        <div className="mt-5 border-t border-meridian-border pt-4">
          <Link
            href="/deposit"
            className="flex w-full items-center justify-center gap-2 rounded-control bg-meridian-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2563EB]"
          >
            Deposit mETH
            <IconArrowRight className="h-3.5 w-3.5" stroke={2} />
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

// ── Keeper activity feed (full width) ─────────────────────────────────────────

function KeeperFeed({
  decisions,
  loading,
}: {
  decisions: ReturnType<typeof useDecisions>['decisions']
  loading: boolean
}) {
  const recent = decisions.slice(0, 5)

  return (
    <motion.div variants={cardVariant} className="lg:col-span-3">
      <div className="rounded-card border border-meridian-border bg-meridian-surface">

        {/* Card header */}
        <div className="flex items-center justify-between border-b border-meridian-border px-5 py-3.5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
            Keeper Activity
          </p>
          <Link
            href="/decisions"
            className="flex items-center gap-1 text-[12px] text-meridian-blue transition-colors hover:text-meridian-blue-light"
          >
            Full AI log
            <IconArrowRight className="h-3 w-3" stroke={2} />
          </Link>
        </div>

        {/* Body */}
        <div className="px-5">
          {loading && (
            <div>
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-meridian-border py-4 last:border-0"
                >
                  <Skeleton className="h-4 w-4 shrink-0 rounded-full bg-meridian-surface-raised" />
                  <Skeleton className="h-4 flex-1 bg-meridian-surface-raised" />
                  <Skeleton className="h-4 w-12 bg-meridian-surface-raised" />
                  <Skeleton className="h-4 w-14 bg-meridian-surface-raised" />
                </div>
              ))}
            </div>
          )}

          {!loading && recent.length === 0 && (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="text-[13px] text-meridian-text-secondary">No keeper cycles yet</p>
              <p className="mt-1 text-[12px] text-meridian-text-tertiary">
                Runs every hour — first cycle will appear here.
              </p>
            </div>
          )}

          {!loading && recent.length > 0 && (
            <div>
              {recent.map((d, idx) => {
                const isLast = idx === recent.length - 1
                const mode = d.reasoning?.decision.mode
                const isHeld = mode === 'defensive'
                const isRebalance = mode === 'normal'

                const Icon = isHeld ? IconCheck : isRebalance ? IconRefresh : IconArrowRight
                const iconCls = isHeld
                  ? 'text-meridian-success'
                  : isRebalance
                  ? 'text-meridian-text-secondary'
                  : 'text-meridian-blue'

                const actionLabel = isHeld
                  ? 'Held — no rebalance needed'
                  : isRebalance
                  ? 'Rebalance executed'
                  : 'Keeper action'

                const perfPositive = d.perfDeltaBps >= 0

                return (
                  <div
                    key={d.index}
                    className={`flex items-center gap-4 py-3.5 ${
                      isLast ? '' : 'border-b border-meridian-border'
                    }`}
                  >
                    {/* Mode icon */}
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} stroke={1.5} />

                    {/* Action + CID */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-meridian-text-primary">{actionLabel}</p>
                      {d.cid && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-meridian-text-tertiary">
                          {d.cid.slice(0, 20)}…
                        </p>
                      )}
                    </div>

                    {/* Decision # badge */}
                    <span className="shrink-0 rounded-pill border border-meridian-border px-2 py-0.5 font-mono text-[10px] text-meridian-text-tertiary">
                      #{d.index + 1}
                    </span>

                    {/* Perf delta */}
                    <span
                      className={`w-16 shrink-0 text-right tabular-nums text-[13px] font-semibold ${
                        perfPositive ? 'text-meridian-success' : 'text-meridian-danger'
                      }`}
                    >
                      {perfPositive ? '+' : ''}
                      {(d.perfDeltaBps / 100).toFixed(2)}%
                    </span>

                    {/* Timestamp */}
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] text-meridian-text-tertiary">
                      {fmtRelTime(d.timestamp)}
                    </span>

                    {/* On-chain link */}
                    {d.cid && (
                      <a
                        href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-meridian-text-tertiary transition-colors hover:text-meridian-text-secondary"
                      >
                        <IconExternalLink className="h-3.5 w-3.5" stroke={1.5} />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const vault = useVaultState()
  const { decisions, isLoading: decisionsLoading } = useDecisions()

  const latestDecision = decisions[0] ?? null
  const latestPerf = latestDecision?.perfDeltaBps ?? null
  const latestTimestamp = latestDecision?.timestamp ?? null

  const nextRebalanceIn =
    vault.lastRebalance > 0n && vault.cooldown > 0n
      ? Number(vault.lastRebalance + vault.cooldown) - Math.floor(Date.now() / 1000)
      : null

  return (
    <div className="mx-auto max-w-content px-6 py-8">

      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold text-meridian-text-primary">
          Vault Dashboard
        </h1>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-meridian-text-tertiary">
          cmETH · Aave V3 · USDY · Mantle Sepolia
        </p>
      </div>

      {/* ── Bento grid ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        variants={bentoStagger}
        initial="hidden"
        animate="show"
      >
        {/* Row 1 */}
        <TvlCard
          totalAssets={vault.totalAssets}
          idleMeth={vault.idleMeth}
          loading={vault.isLoading}
        />
        <SharePriceCard
          sharePrice={vault.sharePrice}
          latestPerf={latestPerf}
          latestTimestamp={latestTimestamp}
          loading={vault.isLoading}
          perfLoading={decisionsLoading}
        />

        {/* Row 2 */}
        <AllocationCard
          strategies={vault.strategies}
          idleMeth={vault.idleMeth}
          totalAssets={vault.totalAssets}
          loading={vault.isLoading}
          latestDecision={latestDecision}
        />
        <KeeperStatusCard
          nextRebalanceIn={nextRebalanceIn}
          isLoading={vault.isLoading}
        />

        {/* Row 3 — full width */}
        <KeeperFeed decisions={decisions} loading={decisionsLoading} />
      </motion.div>

    </div>
  )
}
