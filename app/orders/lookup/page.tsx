'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export default function OrderLookupPage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber, email }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to find that order.')
      router.push(`/account/orders/${encodeURIComponent(data.orderNumber)}?email=${encodeURIComponent(email.trim())}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to find that order.')
      setLoading(false)
    }
  }

  return (
    <main className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <span className="muted">ORDERS</span>
        <h1 className="h2" style={{ fontSize: 42, marginTop: 10 }}>Track your order</h1>
        <p className="muted">Enter your order number and the email you used at checkout.</p>
        <form onSubmit={submit} className="card" style={{ padding: 24, marginTop: 20 }}>
          <label className="fieldLabel" htmlFor="orderNumber">Order number</label>
          <input className="input" id="orderNumber" required autoComplete="off" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="ORD-..." />
          <label className="fieldLabel" htmlFor="email" style={{ marginTop: 14 }}>Email</label>
          <input className="input" id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          {error && <div className="alert danger" style={{ marginTop: 14 }} role="alert" aria-live="polite">{error}</div>}
          <button className="btn" disabled={loading} style={{ width: '100%', marginTop: 16 }}>{loading ? 'Searching…' : 'Find my order'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>Have an account? <Link href="/account/login" style={{ textDecoration: 'underline' }}>Sign in</Link> to see all your orders.</p>
      </div>
    </main>
  )
}
