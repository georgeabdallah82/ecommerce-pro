'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()
      setMessage(data.message || data.error || 'If an account exists, recovery instructions have been sent.')
    } catch {
      setMessage('Unable to process the request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <span className="muted">ACCOUNT</span>
        <h1 className="h2" style={{ fontSize: 42, marginTop: 10 }}>Forgot password?</h1>
        <p className="muted">Enter your email and, if an account exists, we’ll send recovery instructions.</p>
        <form onSubmit={submit} className="card" style={{ padding: 24, marginTop: 20 }}>
          <label className="fieldLabel" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn" disabled={loading} style={{ width: '100%', marginTop: 16 }}>{loading ? 'Sending…' : 'Send reset instructions'}</button>
          {message && <p className="muted" style={{ marginTop: 14 }} role="status">{message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 16 }}><Link href="/account/login" style={{ textDecoration: 'underline' }}>Back to sign in</Link></p>
      </div>
    </main>
  )
}
