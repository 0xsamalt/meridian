'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconExternalLink,
  IconBrain,
  IconShieldExclamation,
  IconClock,
  IconLoader2,
  IconChevronDown,
  IconChevronUp,
  IconArrowRight,
  IconRefresh,
  IconCheck,
} from '@tabler/icons-react'
import { useDecisions, type Decision } from '@/hooks/useDecisions'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtRelTime, fmt } from '@/lib/utils'
import { EXPLORER, REGISTRY_ADDRESS, STRATEGY_META } from '@/lib/contracts'

// ── Animation variants ─────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

const listVariants = {
  show: { transition: { staggerChildren: 0.1 } },
}

// ── Score bar chart ────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  cmeth: '#3B82F6',
  aave:  '#185FA5',
  usdy:  '#93C5FD',
}

function ScoreBars({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores)
  if (entries.length === 0) return null
  const max = Math.max(...entries.map(([, v]) => v))

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="mb-1 flex justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">{key}</span>
            <span className="tabular-nums text-[11px] text-meridian-text-secondary">{value.toFixed(2)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-meridian-surface-raised">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(value / max) * 100}%`, background: STRATEGY_COLORS[key] ?? '#374151' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Allocation table ───────────────────────────────────────────────────────────

function AllocationTable({ targetBps }: { targetBps: Record<string, number> }) {
  const rows = Object.entries(targetBps)

  return (
    <div className="grid grid-cols-4 gap-2">
      {rows.map(([key, bps]) => {
        const pct = bps / 100
        const color =
          key === 'idle' ? '#374151' : (STRATEGY_COLORS[key] ?? '#374151')
        const label =
          key === 'idle'
            ? 'Idle'
            : Object.values(STRATEGY_META).find((m) => m.key === key)?.label ?? key

        return (
          <div
            key={key}
            className="rounded-md border border-meridian-border bg-meridian-surface-raised p-2 text-center"
          >
            <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-meridian-border">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(pct, 100)}%`, background: color }}
              />
            </div>
            <p className="tabular-nums text-[13px] font-semibold text-meridian-text-primary">
              {pct.toFixed(1)}%
            </p>
            <p className="truncate text-[11px] text-meridian-text-tertiary">{label}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Single decision card ───────────────────────────────────────────────────────

function DecisionCard({ d }: { d: Decision }) {
  const [expanded, setExpanded] = useState(false)

  const perfPositive = d.perfDeltaBps >= 0
  const doc = d.reasoning
  const mode = doc?.decision.mode

  const isHeld = mode === 'defensive'
  const ModeIcon = isHeld ? IconCheck : IconRefresh
  const modeLabel = isHeld ? 'defensive' : mode ?? 'normal'
  const modeColor = isHeld ? 'text-meridian-success' : 'text-meridian-blue'
  const modeBg = isHeld
    ? 'border-meridian-success/30 bg-meridian-success/10'
    : 'border-meridian-blue/30 bg-meridian-blue/10'

  return (
    <motion.div variants={cardVariants} layout>
      <div className="overflow-hidden rounded-card border border-meridian-border bg-meridian-surface">

        {/* ── Card header ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <IconBrain className="h-4 w-4 text-meridian-blue" stroke={1.5} />
            <span className="text-[14px] font-semibold text-meridian-text-primary">
              Decision #{d.index + 1}
            </span>
            <span className="text-[13px] text-meridian-text-tertiary">
              {fmtRelTime(d.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {doc && (
              <span
                className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${modeBg} ${modeColor}`}
              >
                {isHeld && <IconShieldExclamation className="h-2.5 w-2.5" stroke={1.5} />}
                {modeLabel}
              </span>
            )}
            <span
              className={`tabular-nums text-[14px] font-semibold ${
                perfPositive ? 'text-meridian-success' : 'text-meridian-danger'
              }`}
            >
              {perfPositive ? '+' : ''}
              {(d.perfDeltaBps / 100).toFixed(2)}%
              <span className="ml-1 text-[11px] font-normal text-meridian-text-tertiary">
                vs hold
              </span>
            </span>
          </div>
        </div>

        {/* ── Card body ── */}
        <div className="space-y-4 border-t border-meridian-border px-5 pb-4 pt-4">

          {/* IPFS loading skeleton */}
          {d.ipfsLoading && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full bg-meridian-surface-raised" />
              <Skeleton className="h-4 w-3/4 bg-meridian-surface-raised" />
              <Skeleton className="h-4 w-1/2 bg-meridian-surface-raised" />
            </div>
          )}

          {/* IPFS error */}
          {d.ipfsError && (
            <p className="text-[13px] text-meridian-text-tertiary">
              Could not fetch reasoning from IPFS — CID:{' '}
              <code className="font-mono text-meridian-text-secondary">
                {d.cid.slice(0, 16)}…
              </code>
            </p>
          )}

          {doc && (
            <>
              {/* Allocation targets — always visible */}
              <div>
                <p className="mb-2 text-[13px] text-meridian-text-secondary">Target Allocation</p>
                <AllocationTable targetBps={doc.decision.targetBps} />
              </div>

              {/* Benchmark — always visible */}
              <div className="rounded-md border border-meridian-border bg-meridian-surface-raised px-4 py-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <span className="text-[13px] text-meridian-text-tertiary">Vault value</span>
                  <span className="tabular-nums text-right text-[13px] text-meridian-text-primary">
                    {doc.benchmark.vaultValueMeth != null
                      ? `${fmt(BigInt(doc.benchmark.vaultValueMeth), 4)} mETH`
                      : '—'}
                  </span>
                  <span className="text-[13px] text-meridian-text-tertiary">Passive hold</span>
                  <span className="tabular-nums text-right text-[13px] text-meridian-text-primary">
                    {doc.benchmark.passiveHoldMeth != null
                      ? `${fmt(BigInt(doc.benchmark.passiveHoldMeth), 4)} mETH`
                      : '—'}
                  </span>
                  <span className="text-[13px] text-meridian-text-tertiary">Outperformance</span>
                  <span
                    className={`tabular-nums text-right text-[13px] font-semibold ${
                      doc.benchmark.perfDeltaBps >= 0
                        ? 'text-meridian-success'
                        : 'text-meridian-danger'
                    }`}
                  >
                    {doc.benchmark.perfDeltaBps >= 0 ? '+' : ''}
                    {(doc.benchmark.perfDeltaBps / 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Expand / collapse toggle for full reasoning */}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-meridian-border bg-meridian-surface-raised px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-secondary transition-colors hover:border-meridian-border-hover hover:text-meridian-text-primary"
              >
                <span>AI Reasoning</span>
                {expanded ? (
                  <IconChevronUp className="h-4 w-4" stroke={1.5} />
                ) : (
                  <IconChevronDown className="h-4 w-4" stroke={1.5} />
                )}
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="reasoning"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-1">
                      {/* Rationale text */}
                      <p className="text-[14px] leading-relaxed text-meridian-text-secondary">
                        {doc.rationale}
                      </p>

                      {/* Score bars */}
                      {Object.keys(doc.scores).length > 0 && (
                        <div>
                          <p className="mb-2 text-[13px] text-meridian-text-tertiary">
                            Raw Scores (pre-normalization)
                          </p>
                          <ScoreBars scores={doc.scores} />
                        </div>
                      )}

                      {/* Signal freshness */}
                      <div className="flex gap-4 text-[12px]">
                        <span
                          className={
                            doc.inputs.stale.nansen
                              ? 'text-meridian-warning'
                              : 'text-meridian-success'
                          }
                        >
                          {doc.inputs.stale.nansen ? '⚠ Nansen stale' : '● Nansen live'}
                        </span>
                        <span
                          className={
                            doc.inputs.stale.elfa
                              ? 'text-meridian-warning'
                              : 'text-meridian-success'
                          }
                        >
                          {doc.inputs.stale.elfa ? '⚠ Elfa stale' : '● Elfa live'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Footer: timestamp + IPFS + on-chain links */}
          <div className="flex flex-wrap items-center gap-3 border-t border-meridian-border pt-3 text-[12px] text-meridian-text-tertiary">
            <IconClock className="h-3.5 w-3.5 shrink-0" stroke={1.5} />
            <span className="font-mono">{new Date(d.timestamp * 1000).toISOString()}</span>
            {d.cid && (
              <>
                <span className="rounded-md bg-meridian-surface-raised px-2 py-0.5 font-mono text-[10px] text-meridian-text-secondary">{d.cid.slice(0, 20)}…</span>
                <a
                  href={`https://w3s.link/ipfs/${d.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 transition-colors hover:text-meridian-text-secondary"
                >
                  IPFS reasoning
                  <IconExternalLink className="h-3 w-3" stroke={1.5} />
                </a>
              </>
            )}
            <a
              href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-meridian-text-secondary"
            >
              On-chain
              <IconExternalLink className="h-3 w-3" stroke={1.5} />
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function DecisionSkeleton() {
  return (
    <div className="space-y-3 rounded-card border border-meridian-border bg-meridian-surface p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32 bg-meridian-surface-raised" />
        <Skeleton className="h-4 w-16 bg-meridian-surface-raised" />
      </div>
      <Skeleton className="h-16 w-full bg-meridian-surface-raised" />
      <Skeleton className="h-4 w-3/4 bg-meridian-surface-raised" />
      <Skeleton className="h-4 w-1/2 bg-meridian-surface-raised" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DecisionsPage() {
  const { decisions, isLoading } = useDecisions()

  return (
    <div className="mx-auto max-w-content space-y-6 px-6 py-8">

      {/* Page title */}
      <div>
        <h1 className="text-[24px] font-semibold text-meridian-text-primary">AI Decision Log</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-meridian-text-secondary">
          Every rebalance is transparent and verifiable — reasoning pinned to IPFS, hash anchored on-chain.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <DecisionSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && decisions.length === 0 && (
        <div className="rounded-card border border-meridian-border bg-meridian-surface">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <svg width="48" height="42" viewBox="0 0 32 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4 opacity-20">
              <circle cx="13" cy="14" r="10" stroke="#93C5FD" strokeWidth="3.5" fill="none" />
              <circle cx="19" cy="14" r="10" stroke="#3B82F6" strokeWidth="3.5" fill="none" />
            </svg>
            <p className="text-[15px] font-medium text-meridian-text-primary">
              No rebalances recorded yet
            </p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-meridian-text-secondary">
              The keeper runs every hour. Once it triggers a rebalance, each decision will appear
              here with the full AI reasoning, scores, and on-chain proof.
            </p>
            <a
              href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center gap-1.5 text-[13px] text-meridian-blue transition-colors hover:text-meridian-blue-light"
            >
              View registry on Mantlescan
              <IconExternalLink className="h-3.5 w-3.5" stroke={1.5} />
            </a>
          </div>
        </div>
      )}

      {/* Decision list */}
      {!isLoading && decisions.length > 0 && (
        <>
          <div className="flex items-center justify-between text-[13px] text-meridian-text-tertiary">
            <span>
              {decisions.length} decision{decisions.length !== 1 ? 's' : ''} recorded
            </span>
            {decisions.some((d) => d.ipfsLoading) && (
              <span className="flex items-center gap-1.5">
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" stroke={1.5} />
                Fetching IPFS reasoning…
              </span>
            )}
          </div>

          <motion.div
            className="space-y-4"
            variants={listVariants}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {decisions.map((d) => (
                <DecisionCard key={d.index} d={d} />
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  )
}
