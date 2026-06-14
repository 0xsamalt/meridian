'use client'

import { useEffect } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react'
import { EXPLORER } from '@/lib/contracts'
import { useTxToast } from '@/contexts/TxToastContext'

function fmtHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function Inner({ hash }: { hash: `0x${string}` }) {
  const { dismiss } = useTxToast()
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!confirmed) return
    const id = setTimeout(dismiss, 6_000)
    return () => clearTimeout(id)
  }, [confirmed, dismiss])

  return (
    <div
      role="status"
      onClick={() => window.open(`${EXPLORER}/tx/${hash}`, '_blank', 'noopener,noreferrer')}
      className="flex cursor-pointer items-start gap-3 rounded-card border border-meridian-border bg-meridian-surface px-4 py-3 shadow-xl transition-colors hover:border-meridian-border-hover"
    >
      <div className="mt-0.5 shrink-0">
        {confirmed
          ? <CheckCircle2 className="h-4 w-4 text-meridian-success" />
          : <Loader2 className="h-4 w-4 animate-spin text-meridian-blue" />
        }
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-meridian-text-primary">
          {confirmed ? 'Transaction Confirmed' : confirming ? 'Waiting for Confirmation…' : 'Transaction Submitted'}
        </p>
        <p className="font-mono text-[10px] text-meridian-text-tertiary">{fmtHash(hash)}</p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-meridian-blue">
          View on Mantlescan
          <ExternalLink className="h-2.5 w-2.5" />
        </p>
      </div>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); dismiss() }}
        className="shrink-0 rounded p-0.5 text-meridian-text-tertiary transition-colors hover:text-meridian-text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function TxToast() {
  const { tx } = useTxToast()
  if (!tx) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72">
      <Inner hash={tx.hash} />
    </div>
  )
}
