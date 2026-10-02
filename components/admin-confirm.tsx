'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import ui from './admin-ui.module.css'

// One styled confirm step for every destructive or irreversible admin action, instead of the
// browser's native confirm() popup. Usage:
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete this page?', confirmLabel: 'Delete page' }))) return

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  // 'danger' (default): delete/disable/cancel. 'default': irreversible but not destructive (ship, send).
  tone?: 'danger' | 'default'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

const nativeConfirm: ConfirmFn = async ({ title, message }) => window.confirm([title, message].filter(Boolean).join('\n\n'))

export function useConfirm(): ConfirmFn {
  // Outside the admin shell there's no provider; fall back to the browser dialog.
  return useContext(ConfirmContext) || nativeConfirm
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<ConfirmFn>(options => new Promise<boolean>(resolve => {
    setPending(current => { current?.resolve(false); return { ...options, resolve } })
  }), [])

  const close = useCallback((ok: boolean) => {
    setPending(current => { current?.resolve(ok); return null })
  }, [])

  useEffect(() => {
    if (!pending) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, close])

  const danger = (pending?.tone || 'danger') === 'danger'

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {pending && (
      <div className={ui.modalOverlay} onClick={() => close(false)}>
        <div className={`${ui.modal} ${ui.confirmModal}`} role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" onClick={e => e.stopPropagation()}>
          <span className={danger ? ui.confirmIcon : `${ui.confirmIcon} ${ui.confirmIconNeutral}`}>{danger ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}</span>
          <h2 id="admin-confirm-title" className={ui.confirmTitle}>{pending.title}</h2>
          {pending.message && <p className={ui.confirmMessage}>{pending.message}</p>}
          <div className={ui.confirmActions}>
            <button ref={cancelRef} type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => close(false)}>{pending.cancelLabel || 'Cancel'}</button>
            <button type="button" className={danger ? `${ui.btn} ${ui.btnDangerSolid}` : ui.btn} onClick={() => close(true)}>{pending.confirmLabel || (danger ? 'Delete' : 'Confirm')}</button>
          </div>
        </div>
      </div>
    )}
  </ConfirmContext.Provider>
}
