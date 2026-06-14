import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(wei: bigint | undefined, dp = 4): string {
  if (wei === undefined) return '—'
  const n = Number(wei) / 1e18
  return n.toFixed(dp)
}

// VaultCore uses _decimalsOffset() = 6, so vault shares have 24 decimals
export function fmtShares(wei: bigint | undefined, dp = 4): string {
  if (wei === undefined) return '—'
  const n = Number(wei) / 1e24
  return n.toFixed(dp)
}

export function fmtPct(bps: number | bigint, dp = 2): string {
  return (Number(bps) / 100).toFixed(dp) + '%'
}

export function fmtRelTime(timestampSecs: number): string {
  const diffSecs = Math.floor(Date.now() / 1000) - timestampSecs
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ${Math.floor((diffSecs % 3600) / 60)}m ago`
  return new Date(timestampSecs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
