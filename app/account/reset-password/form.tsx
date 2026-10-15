'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) return setMessage(t('Passwords do not match.'))
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const data = await response.json()
      setMessage(data.message || data.error || t('Unable to reset password.'))
    } catch {
      setMessage(t('Unable to reset password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const done = /updated|reset|success/i.test(message) && !/unable|invalid|expired|match/i.test(message)
  return (
    <main className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <span className="muted">{t('ACCOUNT')}</span>
        <h1 className="h2" style={{ fontSize: 42, marginTop: 10 }}>{t('Reset your password')}</h1>
        <p className="muted">{t('Choose a new password for your account.')}</p>
        {!token && <div className="alert danger" style={{ marginTop: 16 }}>{t('This reset link is missing or incomplete.')} <Link href="/account/forgot-password" style={{ textDecoration: 'underline' }}>{t('Request a new one')}</Link>.</div>}
        <form onSubmit={submit} className="card" style={{ padding: 24, marginTop: 20 }}>
          <label className="fieldLabel" htmlFor="password">{t('New password')}</label>
          <input className="input" id="password" type="password" autoComplete="new-password" placeholder={t('8+ characters')} minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
          <label className="fieldLabel" htmlFor="confirm" style={{ marginTop: 12 }}>{t('Confirm password')}</label>
          <input className="input" id="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} />
          <button className="btn" disabled={!token || loading} style={{ width: '100%', marginTop: 16 }} type="submit">{loading ? t('Resetting…') : t('Reset password')}</button>
          {message && <p className="muted" style={{ marginTop: 14 }} role="status">{message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 16 }}><Link href="/account/login" style={{ textDecoration: 'underline' }}>{done ? t('Sign in with your new password') : t('Back to sign in')}</Link></p>
      </div>
    </main>
  )
}
