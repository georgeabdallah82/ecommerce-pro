'use client'

import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'

// "Send the link again" on the check-email page. The answer is the same whether or not the address has an account.
export default function ResendVerification() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') || '')
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || t('Unable to send the link. Please try again.'))
      setMessage(t('If that account is waiting for confirmation, we have sent the link again.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Unable to send the link. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  // Inside the check-email card, with the sign-in form's fields (app/storefront-sprint4.css .authForm).
  return <form onSubmit={submit} className="authForm">
    <label className="fieldLabel" htmlFor="resend-email">{t('Email')}</label>
    <input className="input" id="resend-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
    <button className="btn secondary authSubmit" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send the link again')}</button>
    {message ? <p className="authNotice" role="status">{message}</p> : null}
    {error ? <p className="authNotice isError" role="alert">{error}</p> : null}
  </form>
}
