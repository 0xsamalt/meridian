'use client'

import { useState, useMemo } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { VAULT_ADDRESS, METH_ADDRESS, vaultAbi, erc20Abi, EXPLORER } from '@/lib/contracts'
import { useTxToast } from '@/contexts/TxToastContext'
import { fmt, fmtShares } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const REFETCH_MS = 15_000

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSafe(val: string, decimals = 18): bigint {
  try { return val ? parseUnits(val, decimals) : 0n } catch { return 0n }
}

function sharePriceMeth(totalAssets?: bigint, totalSupply?: bigint): bigint {
  if (!totalAssets || !totalSupply || totalSupply === 0n) return BigInt(1e18)
  // totalSupply is 24-decimal; multiply by 1e24 so result is in 1e18 (mETH per share)
  return (totalAssets * 1_000_000_000_000_000_000_000_000n) / totalSupply
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatMini({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex-1 px-4 first:pl-0 last:pr-0">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">{label}</p>
      {loading ? (
        <Skeleton className="h-5 w-20 bg-meridian-surface-raised" />
      ) : (
        <p className="tabular-nums text-[15px] font-medium text-meridian-text-primary">{value}</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DepositPage() {
  const { address, isConnected } = useAccount()
  const { pushTx } = useTxToast()

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>()

  const depositWei  = useMemo(() => parseSafe(depositAmt),  [depositAmt])
  const withdrawWei = useMemo(() => parseSafe(withdrawAmt, 24), [withdrawAmt])

  // ── Chain reads ─────────────────────────────────────────────────────────────

  const { data: totalAssets, isLoading: taLoading } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalAssets',
    query: { refetchInterval: REFETCH_MS },
  })
  const { data: totalSupply } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalSupply',
    query: { refetchInterval: REFETCH_MS },
  })
  const { data: lastRebalance } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'lastRebalance',
    query: { refetchInterval: REFETCH_MS },
  })

  const { data: methBalance } = useReadContract({
    address: METH_ADDRESS, abi: erc20Abi, functionName: 'balanceOf',
    args: [address as Address],
    query: { enabled: isConnected && !!address, refetchInterval: REFETCH_MS },
  })
  const { data: vaultShares } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'balanceOf',
    args: [address as Address],
    query: { enabled: isConnected && !!address, refetchInterval: REFETCH_MS },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: METH_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: [address as Address, VAULT_ADDRESS],
    query: { enabled: isConnected && !!address, refetchInterval: 5_000 },
  })
  const { data: sharesPreview } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'previewDeposit',
    args: [depositWei],
    query: { enabled: depositWei > 0n },
  })
  const { data: assetsPreview } = useReadContract({
    address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'previewRedeem',
    args: [withdrawWei],
    query: { enabled: withdrawWei > 0n },
  })

  // ── Derived ─────────────────────────────────────────────────────────────────

  const price     = sharePriceMeth(totalAssets, totalSupply)
  const sharesVal = useMemo(() => {
    if (!vaultShares || !totalAssets || !totalSupply || totalSupply === 0n) return 0n
    return (vaultShares * totalAssets) / totalSupply
  }, [vaultShares, totalAssets, totalSupply])

  const needsApproval = !allowance || allowance < depositWei

  const lastRebalanceStr = lastRebalance
    ? new Date(Number(lastRebalance) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  // ── Writes ───────────────────────────────────────────────────────────────────

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: pendingHash })
  const busy = isPending || isConfirming

  async function approve() {
    if (!address) return
    const hash = await writeContractAsync({
      address: METH_ADDRESS, abi: erc20Abi, functionName: 'approve',
      args: [VAULT_ADDRESS, depositWei],
    })
    setPendingHash(hash)
    pushTx(hash)
    await refetchAllowance()
  }

  async function deposit() {
    if (!address) return
    const hash = await writeContractAsync({
      address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'deposit',
      args: [depositWei, address],
    })
    setPendingHash(hash)
    pushTx(hash)
    setDepositAmt('')
  }

  async function redeem() {
    if (!address) return
    const hash = await writeContractAsync({
      address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'redeem',
      args: [withdrawWei, address, address],
    })
    setPendingHash(hash)
    pushTx(hash)
    setWithdrawAmt('')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-4 px-6 py-8">
      {/* Vault card */}
      <div className="rounded-card border border-meridian-border bg-meridian-surface">

        {/* Card header */}
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-meridian-text-primary">Meridian Vault mETH</h1>
              <p className="text-xs text-meridian-text-tertiary">mvmETH — ERC-4626 yield-bearing share</p>
            </div>
            <span className="inline-flex items-center rounded-pill border border-meridian-blue/30 bg-meridian-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-meridian-blue">
              AI-Optimized
            </span>
          </div>

          {/* Vault stats row */}
          <div className="mt-4 flex divide-x divide-meridian-border border-t border-meridian-border pt-4">
            <StatMini
              label="Total Value Locked"
              value={`${fmt(totalAssets)} mETH`}
              loading={taLoading}
            />
            <StatMini
              label="Share Price"
              value={`${fmt(price)} mETH`}
              loading={taLoading}
            />
            <StatMini
              label={isConnected ? 'Your Position' : 'Last Rebalance'}
              value={isConnected ? `${fmt(sharesVal)} mETH` : lastRebalanceStr}
              loading={taLoading && isConnected}
            />
          </div>
        </div>

        {/* Card body */}
        <div className="px-5 pb-5">
          {/* Tab headers */}
          <div className="mb-5 flex gap-6 border-b border-meridian-border">
            <button
              type="button"
              onClick={() => setActiveTab('deposit')}
              className={`-mb-px pb-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                activeTab === 'deposit'
                  ? 'border-b-2 border-meridian-blue text-meridian-text-primary'
                  : 'text-meridian-text-tertiary hover:text-meridian-text-secondary'
              }`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('withdraw')}
              className={`-mb-px pb-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                activeTab === 'withdraw'
                  ? 'border-b-2 border-meridian-blue text-meridian-text-primary'
                  : 'text-meridian-text-tertiary hover:text-meridian-text-secondary'
              }`}
            >
              Withdraw
            </button>
          </div>

          {/* ── DEPOSIT ──────────────────────────────────────────── */}
          {activeTab === 'deposit' && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-meridian-text-tertiary">
                  <span>Amount (mETH)</span>
                  <button
                    type="button"
                    className="transition-colors hover:text-meridian-text-primary"
                    onClick={() => methBalance && setDepositAmt(formatUnits(methBalance, 18))}
                  >
                    Balance: <span className="tabular-nums">{fmt(methBalance)}</span> mETH
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.0000"
                    value={depositAmt}
                    onChange={(e) => setDepositAmt(e.target.value)}
                    className="border-meridian-border bg-meridian-surface-raised py-3 pr-16 text-right tabular-nums text-[16px]"
                  />
                  <button
                    type="button"
                    onClick={() => methBalance && setDepositAmt(formatUnits(methBalance, 18))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill border border-meridian-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary transition-colors hover:border-meridian-border-hover hover:text-meridian-text-primary"
                  >
                    MAX
                  </button>
                </div>
                {sharesPreview !== undefined && depositWei > 0n && (
                  <p className="mt-1 text-right text-xs text-meridian-text-tertiary">
                    You receive ≈ <span className="tabular-nums">{fmtShares(sharesPreview)}</span> mvmETH
                  </p>
                )}
              </div>

              {!isConnected ? (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <Button onClick={show} variant="outline" className="w-full">
                      Connect Wallet
                    </Button>
                  )}
                </ConnectKitButton.Custom>
              ) : needsApproval ? (
                <Button
                  onClick={approve}
                  disabled={depositWei === 0n || busy}
                  className="w-full"
                >
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving…</> : 'Approve mETH'}
                </Button>
              ) : (
                <Button
                  onClick={deposit}
                  disabled={depositWei === 0n || !methBalance || depositWei > methBalance || busy}
                  className="w-full"
                >
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Depositing…</> : 'Deposit'}
                </Button>
              )}

            </div>
          )}

          {/* ── WITHDRAW ──────────────────────────────────────────── */}
          {activeTab === 'withdraw' && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-meridian-text-tertiary">
                  <span>Shares (mvmETH)</span>
                  <button
                    type="button"
                    className="transition-colors hover:text-meridian-text-primary"
                    onClick={() => vaultShares && setWithdrawAmt(formatUnits(vaultShares, 24))}
                  >
                    Balance: <span className="tabular-nums">{fmtShares(vaultShares)}</span> mvmETH
                    {sharesVal > 0n && (
                      <span className="ml-1 text-meridian-text-tertiary">
                        (≈ {fmt(sharesVal)} mETH)
                      </span>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.0000"
                    value={withdrawAmt}
                    onChange={(e) => setWithdrawAmt(e.target.value)}
                    className="border-meridian-border bg-meridian-surface-raised py-3 pr-16 text-right tabular-nums text-[16px]"
                  />
                  <button
                    type="button"
                    onClick={() => vaultShares && setWithdrawAmt(formatUnits(vaultShares, 24))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill border border-meridian-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary transition-colors hover:border-meridian-border-hover hover:text-meridian-text-primary"
                  >
                    MAX
                  </button>
                </div>
                {assetsPreview !== undefined && withdrawWei > 0n && (
                  <p className="mt-1 text-right text-xs text-meridian-text-tertiary">
                    You receive ≈ <span className="tabular-nums">{fmt(assetsPreview)}</span> mETH
                  </p>
                )}
              </div>

              {!isConnected ? (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <Button onClick={show} variant="outline" className="w-full">
                      Connect Wallet
                    </Button>
                  )}
                </ConnectKitButton.Custom>
              ) : (
                <Button
                  onClick={redeem}
                  disabled={withdrawWei === 0n || !vaultShares || withdrawWei > vaultShares || busy}
                  className="w-full"
                >
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redeeming…</> : 'Redeem'}
                </Button>
              )}

            </div>
          )}

          {/* Security bar — inside card, at bottom */}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-meridian-border pt-3 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-meridian-success" />
            <span>Non-custodial</span>
            <span>·</span>
            <a
              href={`${EXPLORER}/address/${VAULT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-meridian-text-primary"
            >
              Verified on Mantlescan ↗
            </a>
            <span>·</span>
            <span>Max 70% per strategy</span>
            <span>·</span>
            <span>1h rebalance cooldown</span>
          </div>
        </div>
      </div>

      {/* Safety constraints */}
      <div className="rounded-card border border-meridian-border bg-meridian-surface px-5 py-4">
        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary">
          Safety Constraints
        </p>
        <div className="inline-flex flex-wrap gap-2">
          {['cmETH max 60%', 'Aave max 60%', 'USDY max 50%', '1h cooldown'].map((label) => (
            <span
              key={label}
              className="rounded-pill border border-meridian-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-meridian-text-tertiary"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-meridian-text-tertiary">
          Keeper wallet can only call <code className="font-mono text-meridian-text-secondary">rebalance()</code> — cannot withdraw funds.
        </p>
      </div>
    </div>
  )
}
