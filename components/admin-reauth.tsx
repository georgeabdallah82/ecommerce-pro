'use client'
import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react'
import ui from './admin-ui.module.css'
import { useModalFocus } from './use-modal-focus'

type AskForConfirmation = () => Promise<boolean>
const ReauthContext = createContext<AskForConfirmation | null>(null)

// Refunds, role changes and removing a staff member need the person to confirm it is them. The server
// says so with REAUTH_REQUIRED. askForConfirmation() opens the dialog and resolves true once the password
// or a 2-step code checks out, and false if the person cancels.
export function useReauth(): AskForConfirmation {
  const ask = useContext(ReauthContext)
  if (!ask) throw new Error('useReauth needs ReauthProvider (app/admin/layout.tsx)')
  return ask
}

// Runs a sensitive request. If the server asks for a confirmation, the person confirms and the request runs once more.
export async function runReauthed<T>(askForConfirmation: AskForConfirmation, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'REAUTH_REQUIRED') throw error
    if (!(await askForConfirmation())) throw error
    return run()
  }
}

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<((ok: boolean) => void) | null>(null)
  // A modal dialog (components/use-modal-focus.ts): Tab stays in it, Escape cancels, focus goes back to the
  // button that needed it. It opens on top of other dialogs (a refund), which leave its keys alone.
  const form = useRef<HTMLFormElement>(null)
  useModalFocus(form, open, () => { if (!busy) finish(false) })

  const askForConfirmation = useCallback<AskForConfirmation>(() => new Promise<boolean>(resolve => {
    pending.current = resolve
    setPassword(''); setCode(''); setError(''); setOpen(true)
  }), [])

  function finish(ok: boolean) {
    setOpen(false)
    pending.current?.(ok)
    pending.current = null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/reauth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(password ? { password } : { code: code.trim() }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || 'That password or code is not right.'); return }
      finish(true)
    } catch {
      setError('Unable to confirm right now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <ReauthContext.Provider value={askForConfirmation}>
    {children}
    {open && <div className={ui.modalOverlay} onClick={() => finish(false)}>
      <form ref={form} className={ui.card} role="dialog" aria-modal="true" aria-labelledby="reauth-title" tabIndex={-1} style={{ width: 'min(420px,92vw)', padding: 24 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 id="reauth-title" style={{ margin: 0 }}>Confirm it is you</h2>
        <p className={ui.muted}>This action needs your password or a code from your 2-step app. The confirmation lasts 10 minutes.</p>
        {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
        <label className={ui.fieldLabel}>Password<input className={ui.input} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} data-autofocus /></label>
        <label className={ui.fieldLabel}>or the 6-digit code from your app<input className={ui.input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => finish(false)}>Cancel</button>
          <button className={ui.btn} disabled={busy || (!password && !code.trim())}>{busy ? 'Checking…' : 'Confirm'}</button>
        </div>
      </form>
    </div>}
  </ReauthContext.Provider>
}
