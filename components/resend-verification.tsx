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

  return <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 12, padding: 18 }}>
    <label style={{ display: 'grid', gap: 6, fontWeight: 700, fontSize: 14 }}>{t('Email')}
      <input name="email" type="email" required maxLength={254} style={{ minHeight: 46, padding: '10px 12px', border: '1px solid #d6d6d0', borderRadius: 10, font: 'inherit', fontSize: 16 }} />
    </label>
    <button className="btn secondary" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send the link again')}</button>
    {message ? <p role="status" style={{ margin: 0 }}>{message}</p> : null}
    {error ? <p role="alert" style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>{error}</p> : null}
  </form>
}
