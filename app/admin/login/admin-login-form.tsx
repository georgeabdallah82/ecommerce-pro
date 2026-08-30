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
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')
      window.location.assign('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
        <h1 style={{ marginBottom: 6 }}>Admin sign in</h1>
        <p className="muted" style={{ marginBottom: 22 }}>Authorized staff only. Customer accounts cannot sign in here.</p>
        <label style={{ display: 'block', marginBottom: 14 }}>
          <span>Email</span>
          <input className="input" name="email" type="email" autoComplete="username" required />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span>Password</span>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <div className="alert danger" style={{ marginBottom: 14 }}>{error}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in to Control Center'}
        </button>
      </form>
    </main>
  )
}
