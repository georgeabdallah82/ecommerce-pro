'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) return setMessage('Passwords do not match.')
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const data = await response.json()
      setMessage(data.message || data.error || 'Unable to reset password.')
    } catch {
      setMessage('Unable to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const done = /updated|reset|success/i.test(message) && !/unable|invalid|expired|match/i.test(message)
  return (
    <main className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <span className="muted">ACCOUNT</span>
        <h1 className="h2" style={{ fontSize: 42, marginTop: 10 }}>Reset your password</h1>
        <p className="muted">Choose a new password for your account.</p>
        {!token && <div className="alert danger" style={{ marginTop: 16 }}>This reset link is missing or incomplete. <Link href="/account/forgot-password" style={{ textDecoration: 'underline' }}>Request a new one</Link>.</div>}
        <form onSubmit={submit} className="card" style={{ padding: 24, marginTop: 20 }}>
          <label className="fieldLabel" htmlFor="password">New password</label>
          <input className="input" id="password" type="password" autoComplete="new-password" placeholder="8+ characters" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
          <label className="fieldLabel" htmlFor="confirm" style={{ marginTop: 12 }}>Confirm password</label>
          <input className="input" id="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} />
          <button className="btn" disabled={!token || loading} style={{ width: '100%', marginTop: 16 }} type="submit">{loading ? 'Resetting…' : 'Reset password'}</button>
          {message && <p className="muted" style={{ marginTop: 14 }} role="status">{message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 16 }}><Link href="/account/login" style={{ textDecoration: 'underline' }}>{done ? 'Sign in with your new password' : 'Back to sign in'}</Link></p>
      </div>
    </main>
  )
}
