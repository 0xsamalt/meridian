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
import { ShieldCheck, ExternalLink, Loader2 } from 'lucide-react'
import { VAULT_ADDRESS, METH_ADDRESS, vaultAbi, erc20Abi, EXPLORER } from '@/lib/contracts'
import { fmt } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const REFETCH_MS = 15_000

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSafe(val: string, decimals = 18): bigint {
  try { return val ? parseUnits(val, decimals) : 0n } catch { return 0n }
}

function sharePriceMeth(totalAssets?: bigint, totalSupply?: bigint): bigint {
  if (!totalAssets || !totalSupply || totalSupply === 0n) return BigInt(1e18)
  return (totalAssets * BigInt(1e18)) / totalSupply
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatMini({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <p className="tabular-nums text-sm font-medium text-foreground">{value}</p>
      )}
    </div>
  )
}

function TxStatus({
  hash,
  isConfirming,
  isConfirmed,
}: {
  hash?: `0x${string}`
  isConfirming: boolean
  isConfirmed: boolean
}) {
  if (!hash) return null
  return (
    <div className="mt-2 text-center text-xs">
      {isConfirming && (
        <span className="flex items-center justify-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Waiting for confirmation…
        </span>
      )}
      {isConfirmed && (
        <a
          href={`${EXPLORER}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-yield hover:underline"
        >
          ✓ Transaction confirmed
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DepositPage() {
  const { address, isConnected } = useAccount()

  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>()

  const depositWei   = useMemo(() => parseSafe(depositAmt),  [depositAmt])
  const withdrawWei  = useMemo(() => parseSafe(withdrawAmt), [withdrawAmt])

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

  const price      = sharePriceMeth(totalAssets, totalSupply)
  const sharesVal  = useMemo(() => {
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
    await refetchAllowance()
  }

  async function deposit() {
    if (!address) return
    const hash = await writeContractAsync({
      address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'deposit',
      args: [depositWei, address],
    })
    setPendingHash(hash)
    setDepositAmt('')
  }

  async function redeem() {
    if (!address) return
    const hash = await writeContractAsync({
      address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'redeem',
      args: [withdrawWei, address, address],
    })
    setPendingHash(hash)
    setWithdrawAmt('')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Security bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-4 py-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-yield" />
        <span>Non-custodial</span>
        <span className="text-border">·</span>
        <a
          href={`${EXPLORER}/address/${VAULT_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Verified on Mantlescan ↗
        </a>
        <span className="text-border">·</span>
        <span>Max 70% per strategy</span>
        <span className="text-border">·</span>
        <span>1h rebalance cooldown</span>
      </div>

      {/* Vault card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-foreground">Meridian Vault mETH</h1>
              <p className="text-xs text-muted-foreground">mvmETH — ERC-4626 yield-bearing share</p>
            </div>
            <Badge variant="active">AI-Optimized</Badge>
          </div>

          {/* Vault stats */}
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4">
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
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="deposit">
            <TabsList className="mb-5 w-full">
              <TabsTrigger value="deposit"  className="flex-1">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
            </TabsList>

            {/* ── DEPOSIT ─────────────────────────────────────────── */}
            <TabsContent value="deposit" className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Amount (mETH)</span>
                  <button
                    type="button"
                    className="transition-colors hover:text-foreground"
                    onClick={() => methBalance && setDepositAmt(formatUnits(methBalance, 18))}
                  >
                    Balance: <span className="tabular-nums">{fmt(methBalance)}</span> mETH
                  </button>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.0000"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                  className="text-right tabular-nums"
                />
                {sharesPreview !== undefined && depositWei > 0n && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    You receive ≈ <span className="tabular-nums">{fmt(sharesPreview)}</span> mvmETH
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

              <TxStatus hash={pendingHash} isConfirming={isConfirming} isConfirmed={isConfirmed} />
            </TabsContent>

            {/* ── WITHDRAW ─────────────────────────────────────────── */}
            <TabsContent value="withdraw" className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Shares (mvmETH)</span>
                  <button
                    type="button"
                    className="transition-colors hover:text-foreground"
                    onClick={() => vaultShares && setWithdrawAmt(formatUnits(vaultShares, 18))}
                  >
                    Balance: <span className="tabular-nums">{fmt(vaultShares)}</span> mvmETH
                    {sharesVal > 0n && (
                      <span className="ml-1 text-muted-foreground">
                        (≈ {fmt(sharesVal)} mETH)
                      </span>
                    )}
                  </button>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.0000"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value)}
                  className="text-right tabular-nums"
                />
                {assetsPreview !== undefined && withdrawWei > 0n && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
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

              <TxStatus hash={pendingHash} isConfirming={isConfirming} isConfirmed={isConfirmed} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Guard-rail indicators */}
      <div className="rounded-md border border-border px-4 py-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Safety constraints
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
          <span>cmETH max 60%</span>
          <span>Aave max 60%</span>
          <span>USDY max 50%</span>
          <span>1h rebalance cooldown</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Keeper wallet can only call <code className="font-mono text-foreground/60">rebalance()</code> — cannot withdraw funds.
        </p>
      </div>
    </div>
  )
}
