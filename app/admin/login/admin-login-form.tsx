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
      setError(err instanceof Error ? err.message : 'Unable to sign in')
      setBusy(false)
    }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
      <p className="muted" style={{ marginTop: 0 }}>Store operations</p>
      <h1 style={{ marginBottom: 8 }}>Admin sign in</h1>
      <p className="muted">Staff access only. Customer accounts cannot sign in here.</p>
      <label style={{ display: 'block', marginTop: 18 }}>Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
      <label style={{ display: 'block', marginTop: 12 }}>Password<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
      {error && <div className="alert danger" style={{ marginTop: 14 }}>{error}</div>}
      <button className="btn" style={{ marginTop: 16, width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>
}
