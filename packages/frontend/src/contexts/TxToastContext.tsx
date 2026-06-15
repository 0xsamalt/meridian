'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type TxEntry = { hash: `0x${string}` }

type TxToastCtx = {
  tx: TxEntry | null
  err: string | null
  pushTx: (hash: `0x${string}`) => void
  pushError: (msg: string) => void
  dismiss: () => void
  dismissErr: () => void
}

const TxToastContext = createContext<TxToastCtx>({
  tx: null,
  err: null,
  pushTx: () => {},
  pushError: () => {},
  dismiss: () => {},
  dismissErr: () => {},
})

export function TxToastProvider({ children }: { children: React.ReactNode }) {
  const [tx, setTx] = useState<TxEntry | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const pushTx = useCallback((hash: `0x${string}`) => setTx({ hash }), [])
  const pushError = useCallback((msg: string) => setErr(msg), [])
  const dismiss = useCallback(() => setTx(null), [])
  const dismissErr = useCallback(() => setErr(null), [])

  return (
    <TxToastContext.Provider value={{ tx, err, pushTx, pushError, dismiss, dismissErr }}>
      {children}
    </TxToastContext.Provider>
  )
}

export function useTxToast() {
  return useContext(TxToastContext)
}
