'use client'

import { FormEvent, useState } from 'react'

export default function AdminLoginForm() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Invalid admin credentials')
      window.location.assign('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setBusy(false)
    }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
      <h1>Admin sign in</h1>
      <p className="muted">Authorized staff only.</p>
      <label>Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
      {error && <div className="alert danger">{error}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>
}
