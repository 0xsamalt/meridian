'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type TxEntry = { hash: `0x${string}` }

type TxToastCtx = {
  tx: TxEntry | null
  pushTx: (hash: `0x${string}`) => void
  dismiss: () => void
}

const TxToastContext = createContext<TxToastCtx>({
  tx: null,
  pushTx: () => {},
  dismiss: () => {},
})

export function TxToastProvider({ children }: { children: React.ReactNode }) {
  const [tx, setTx] = useState<TxEntry | null>(null)

  const pushTx = useCallback((hash: `0x${string}`) => {
    setTx({ hash })
  }, [])

  const dismiss = useCallback(() => setTx(null), [])

  return (
    <TxToastContext.Provider value={{ tx, pushTx, dismiss }}>
      {children}
    </TxToastContext.Provider>
  )
}

export function useTxToast() {
  return useContext(TxToastContext)
}
