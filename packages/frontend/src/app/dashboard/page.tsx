'use client'

import Link from 'next/link'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ExternalLink, TrendingUp, ArrowRight, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useVaultState } from '@/hooks/useVaultState'
import { useDecisions } from '@/hooks/useDecisions'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fmt, fmtPct, fmtRelTime } from '@/lib/utils'
import { EXPLORER, REGISTRY_ADDRESS } from '@/lib/contracts'

// ── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

const stagger = {
  show: { transition: { staggerChildren: 0.08 } },
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  loading,
  accent,
}: {
  label: string
  value: string
  sub?: string
  loading?: boolean
  accent?: 'positive' | 'negative' | 'neutral'
}) {
  const accentCls =
    accent === 'positive' ? 'text-yield' :
    accent === 'negative' ? 'text-red-400' :
    'text-foreground'

  return (
    <motion.div variants={fadeUp}>
      <Card className="h-full">
        <CardContent className="pt-5">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <>
              <Skeleton className="mb-1 h-8 w-28" />
              <Skeleton className="h-3 w-20" />
            </>
          ) : (
            <>
              <p className={`tabular-nums text-2xl font-semibold ${accentCls}`}>{value}</p>
              {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Custom Tooltip for recharts ───────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { color: string } }[] }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: entry } = payload[0]
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <span className="font-medium" style={{ color: entry.color }}>{name}</span>
      <span className="ml-2 tabular-nums text-foreground">{value.toFixed(1)}%</span>
    </div>
  )
}

// ── Allocation donut ──────────────────────────────────────────────────────────

function AllocationDonut({ strategies, idleMeth, totalAssets }: {
  strategies: ReturnType<typeof useVaultState>['strategies']
  idleMeth: bigint
  totalAssets: bigint
}) {
  const idlePct = totalAssets > 0n ? Number((idleMeth * 10000n) / totalAssets) / 100 : 0

  const data = [
    ...strategies.map((s) => ({
      name: s.label,
      value: s.allocationPct,
      color: s.color,
    })),
    { name: 'Idle', value: idlePct, color: '#4B5563' },
  ].filter((d) => d.value > 0)

  if (totalAssets === 0n) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        No assets deposited yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Strategy row ──────────────────────────────────────────────────────────────

function StrategyRow({ s, loading }: {
  s: ReturnType<typeof useVaultState>['strategies'][number]
  loading: boolean
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="text-sm font-medium text-foreground">{s.label}</span>
        </div>
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-sm text-foreground">
        {loading ? <Skeleton className="ml-auto h-4 w-16" /> : `${fmt(s.balanceMeth)} mETH`}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-sm text-yield">
        {loading ? <Skeleton className="ml-auto h-4 w-10" /> : `${fmtPct(s.apyBps)}`}
      </td>
      <td className="py-3 text-right text-sm">
        {loading ? (
          <Skeleton className="ml-auto h-4 w-12" />
        ) : (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${s.allocationPct}%`, background: s.color }}
              />
            </div>
            <span className="tabular-nums text-muted-foreground">{s.allocationPct.toFixed(1)}%</span>
          </div>
        )}
      </td>
      <td className="py-3 text-right">
        <Badge variant="active" className="text-[10px]">Active</Badge>
      </td>
    </tr>
  )
}

// ── Recent rebalances ─────────────────────────────────────────────────────────

function RecentRebalances({ decisions, loading }: {
  decisions: ReturnType<typeof useDecisions>['decisions']
  loading: boolean
}) {
  const recent = decisions.slice(0, 5)

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (recent.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No rebalances yet — the keeper runs every hour.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {recent.map((d) => (
        <div key={d.index} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-xs">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{fmtRelTime(d.timestamp)}</span>
            <Badge
              variant={d.reasoning?.decision.mode === 'defensive' ? 'outline' : 'active'}
              className="text-[10px]"
            >
              {d.reasoning?.decision.mode ?? 'normal'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className={`tabular-nums font-medium ${d.perfDeltaBps >= 0 ? 'text-yield' : 'text-red-400'}`}>
              {d.perfDeltaBps >= 0 ? '+' : ''}{(d.perfDeltaBps / 100).toFixed(2)}%
            </span>
            {d.cid && (
              <a
                href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const vault = useVaultState()
  const { decisions, isLoading: decisionsLoading } = useDecisions()

  const latestDecision = decisions[0]
  const latestPerf = latestDecision?.perfDeltaBps ?? null

  const nextRebalanceIn = vault.lastRebalance > 0n && vault.cooldown > 0n
    ? Number(vault.lastRebalance + vault.cooldown) - Math.floor(Date.now() / 1000)
    : null

  function fmtCountdown(secs: number): string {
    if (secs <= 0) return 'Ready'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vault Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Meridian mETH — AI-optimized yield across cmETH, Aave V3, and USDY
          </p>
        </div>
        {nextRebalanceIn !== null && (
          <div className="text-right text-xs text-muted-foreground">
            <p>Next rebalance in</p>
            <p className="tabular-nums text-base font-semibold text-foreground">
              {fmtCountdown(nextRebalanceIn)}
            </p>
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <StatCard
          label="Total Value Locked"
          value={`${fmt(vault.totalAssets, 4)} mETH`}
          sub={`${fmt(vault.idleMeth, 4)} mETH idle buffer`}
          loading={vault.isLoading}
        />
        <StatCard
          label="Share Price"
          value={`${fmt(vault.sharePrice, 6)} mETH`}
          sub="per mvmETH share"
          loading={vault.isLoading}
        />
        <StatCard
          label="AI vs Passive Hold"
          value={
            latestPerf === null
              ? '—'
              : `${latestPerf >= 0 ? '+' : ''}${(latestPerf / 100).toFixed(2)}%`
          }
          sub={latestDecision ? `since ${fmtRelTime(latestDecision.timestamp)}` : 'no decisions yet'}
          loading={decisionsLoading}
          accent={latestPerf === null ? 'neutral' : latestPerf >= 0 ? 'positive' : 'negative'}
        />
      </motion.div>

      {/* ── Allocation + strategy table ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]"
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        {/* Donut */}
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Live Allocation
            </p>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <AllocationDonut
              strategies={vault.strategies}
              idleMeth={vault.idleMeth}
              totalAssets={vault.totalAssets}
            />
            {/* Legend */}
            <div className="mt-3 space-y-1.5">
              {vault.strategies.map((s) => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                  </span>
                  <span className="tabular-nums text-foreground">{s.allocationPct.toFixed(1)}%</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#4B5563]" />
                  <span className="text-muted-foreground">Idle</span>
                </span>
                <span className="tabular-nums text-foreground">
                  {vault.totalAssets > 0n
                    ? (Number((vault.idleMeth * 10000n) / vault.totalAssets) / 100).toFixed(1)
                    : '0.0'}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Strategy table */}
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Strategy Breakdown
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['Strategy', 'Balance', 'APY', 'Allocation', 'Status'].map((h) => (
                    <th key={h} className="pb-2 text-right text-[10px] font-medium uppercase tracking-widest text-muted-foreground first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vault.strategies.map((s) => (
                  <StrategyRow key={s.key} s={s} loading={vault.isLoading} />
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-yield" />
              <span>Max 70% per strategy · 1h rebalance cooldown · nonReentrant vault</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Recent rebalances ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Recent Rebalances
              </p>
              <Link
                href="/decisions"
                className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
              >
                View full AI log
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <RecentRebalances decisions={decisions} loading={decisionsLoading} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
