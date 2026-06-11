'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { ExternalLink, Brain, ShieldAlert, Clock, Loader2 } from 'lucide-react'
import { useDecisions, type Decision } from '@/hooks/useDecisions'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtRelTime, fmt } from '@/lib/utils'
import { EXPLORER, REGISTRY_ADDRESS, STRATEGY_META } from '@/lib/contracts'

// ── Animation variants ────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

const listVariants = {
  show: { transition: { staggerChildren: 0.1 } },
}

// ── Score bar chart ───────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  cmeth: '#3B82F6',
  aave:  '#10B981',
  usdy:  '#F59E0B',
}

function ScoreBars({ scores }: { scores: Record<string, number> }) {
  const data = Object.entries(scores).map(([key, value]) => ({ key, value: +value.toFixed(2) }))
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} barSize={28} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="key"
          tick={{ fontSize: 10, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <RechartTooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: '#0F1620', border: '1px solid #1E2D45', borderRadius: 6, fontSize: 11 }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.key} fill={STRATEGY_COLORS[d.key] ?? '#6B7280'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Allocation delta row ──────────────────────────────────────────────────────

function AllocationTable({ targetBps }: { targetBps: Record<string, number> }) {
  const rows = Object.entries(targetBps)

  return (
    <div className="grid grid-cols-4 gap-2">
      {rows.map(([key, bps]) => {
        const pct = bps / 100
        const color = key === 'idle' ? '#4B5563' : (STRATEGY_COLORS[key] ?? '#6B7280')
        const label =
          key === 'idle' ? 'Idle' :
          Object.values(STRATEGY_META).find((m) => m.key === key)?.label ?? key

        return (
          <div key={key} className="rounded-md border border-border p-2 text-center">
            <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(pct, 100)}%`, background: color }}
              />
            </div>
            <p className="tabular-nums text-sm font-semibold text-foreground">{pct.toFixed(1)}%</p>
            <p className="truncate text-[10px] text-muted-foreground">{label}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Single decision card ──────────────────────────────────────────────────────

function DecisionCard({ d }: { d: Decision }) {
  const perfPositive = d.perfDeltaBps >= 0
  const doc = d.reasoning

  return (
    <motion.div variants={cardVariants} layout>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Decision #{d.index + 1}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmtRelTime(d.timestamp)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {doc && (
                <Badge
                  variant={doc.decision.mode === 'defensive' ? 'outline' : 'active'}
                  className="text-[10px] uppercase tracking-wider"
                >
                  {doc.decision.mode === 'defensive' && (
                    <ShieldAlert className="mr-1 h-2.5 w-2.5" />
                  )}
                  {doc.decision.mode}
                </Badge>
              )}
              <span
                className={`tabular-nums text-sm font-semibold ${perfPositive ? 'text-yield' : 'text-red-400'}`}
              >
                {perfPositive ? '+' : ''}{(d.perfDeltaBps / 100).toFixed(2)}%
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">vs hold</span>
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {d.ipfsLoading && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {d.ipfsError && (
            <p className="text-xs text-muted-foreground">
              Could not fetch reasoning from IPFS — CID: <code className="font-mono text-foreground/60">{d.cid.slice(0, 16)}…</code>
            </p>
          )}

          {doc && (
            <>
              {/* Allocation targets */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Target Allocation
                </p>
                <AllocationTable targetBps={doc.decision.targetBps} />
              </div>

              {/* Rationale */}
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  AI Rationale
                </p>
                <p className="text-sm leading-relaxed text-foreground/80">{doc.rationale}</p>
              </div>

              {/* Score bars */}
              {Object.keys(doc.scores).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Raw Scores (pre-normalization)
                  </p>
                  <ScoreBars scores={doc.scores} />
                </div>
              )}

              {/* Signal freshness */}
              <div className="flex gap-3 text-[10px]">
                <span className={doc.inputs.stale.nansen ? 'text-yellow-500' : 'text-yield'}>
                  {doc.inputs.stale.nansen ? '⚠ Nansen stale' : '● Nansen live'}
                </span>
                <span className={doc.inputs.stale.elfa ? 'text-yellow-500' : 'text-yield'}>
                  {doc.inputs.stale.elfa ? '⚠ Elfa stale' : '● Elfa live'}
                </span>
              </div>

              {/* Benchmark */}
              <div className="rounded-md border border-border px-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                  <span className="text-muted-foreground">Vault value</span>
                  <span className="tabular-nums text-right text-foreground">
                    {fmt(BigInt(doc.benchmark.vaultValueMeth), 4)} mETH
                  </span>
                  <span className="text-muted-foreground">Passive hold</span>
                  <span className="tabular-nums text-right text-foreground">
                    {fmt(BigInt(doc.benchmark.passiveHoldMeth), 4)} mETH
                  </span>
                  <span className="text-muted-foreground">Outperformance</span>
                  <span className={`tabular-nums text-right font-semibold ${doc.benchmark.perfDeltaBps >= 0 ? 'text-yield' : 'text-red-400'}`}>
                    {doc.benchmark.perfDeltaBps >= 0 ? '+' : ''}{(doc.benchmark.perfDeltaBps / 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Footer: IPFS + on-chain links */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="font-mono">{new Date(d.timestamp * 1000).toISOString()}</span>
            {d.cid && (
              <a
                href={`https://w3s.link/ipfs/${d.cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 transition-colors hover:text-foreground"
              >
                IPFS reasoning <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DecisionSkeleton() {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DecisionsPage() {
  const { decisions, isLoading } = useDecisions()

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">AI Decision Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
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
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Brain className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <p className="text-base font-medium text-foreground">No rebalances recorded yet</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              The keeper runs every hour. Once it triggers a rebalance, each decision
              will appear here with the full AI reasoning, scores, and on-chain proof.
            </p>
            <a
              href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary/80"
            >
              View registry on Mantlescan <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* Decision list */}
      {!isLoading && decisions.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{decisions.length} decision{decisions.length !== 1 ? 's' : ''} recorded</span>
            {decisions.some((d) => d.ipfsLoading) && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
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
