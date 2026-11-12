'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'

// Deleting the account asks for the password again, so a stray tap or a borrowed phone can't do it.
export default function DeleteAccount() {
  const { t } = useI18n()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<{ status: 'idle' | 'deleting' | 'error'; message?: string }>({ status: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setState({ status: 'deleting' })
    const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: data.get('password') }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setState({ status: 'error', message: body.error || t('Unable to delete your account right now.') }); return }
    router.push('/')
    router.refresh()
  }
  return (
    <section className="card" style={{ padding: 24, marginTop: 24 }}>
      <h2 className="h3 accountTitle" style={{ marginTop: 0 }}>{t('Delete my account')}</h2>
      <p className="muted">{t('Your name, email, phone number, addresses, wishlist, reviews and notifications are removed. Your past orders are kept for our records, but they are no longer linked to you.')}</p>
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>{t('Delete my account…')}</button>
      ) : (
        <form onSubmit={submit}>
          <label className="fieldLabel" htmlFor="deletePassword">{t('Enter your password to confirm')}</label>
          <input className="input" id="deletePassword" name="password" type="password" autoComplete="current-password" required />
          {state.message && <div className="alert danger" role="status" style={{ marginTop: 14 }}>{state.message}</div>}
          <button className="btn" style={{ marginTop: 16 }} disabled={state.status === 'deleting'}>{state.status === 'deleting' ? t('Deleting…') : t('Yes, delete my account')}</button>
        </form>
      )}
    </section>
  )
}
