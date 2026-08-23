'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money } from '@/lib/config'
import { canTransitionOrder } from '@/lib/orders'

const statuses = ['PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED']

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export function OrdersAdminPro({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState(initial)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [refund, setRefund] = useState<{ id: string; number: string; currency: string; max: number } | null>(null)
  const [refundAmount, setRefundAmount] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(o => !needle || String(o.orderNumber).toLowerCase().includes(needle) || String(o.email || '').toLowerCase().includes(needle) || String(o.phone || '').toLowerCase().includes(needle))
  }, [rows, q])

  async function refresh() {
    setError('')
    try {
      const params = new URLSearchParams()
      if (filter) params.set('status', filter)
      if (q.trim()) params.set('q', q.trim())
      setRows(await api('/api/admin/orders?' + params.toString()))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load orders') }
  }

  async function update(id: string, data: any) {
    setBusy(id); setError('')
    try {
      await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, ...data }) })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update order') }
    finally { setBusy(null) }
  }

  async function doRefund() {
    if (!refund) return
    const amount = Math.round(Number(refundAmount) * 100)
    if (!Number.isInteger(amount) || amount <= 0 || amount > refund.max) return setError(`Refund must be between 0.01 and ${money(refund.max, refund.currency)}`)
    setBusy(refund.id); setError('')
    try {
      await api('/api/admin/refunds', { method: 'POST', body: JSON.stringify({ orderId: refund.id, amount, reason: 'Admin refund' }) })
      setRefund(null); setRefundAmount(''); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refund order') }
    finally { setBusy(null) }
  }

  return <div>
    <div className="sectionHead"><div><span className="muted">COMMERCE</span><h1 className="h2">Orders</h1><p className="muted">Manage fulfillment, payment status, tracking and refunds.</p></div><div className="inline"><Link className="btn" href="/admin/orders/new">+ Create manual order</Link><span className="pill">{shown.length} shown</span></div></div>
    {error && <div className="alert danger">{error}</div>}
    <div className="filterBar">
      <input className="input" placeholder="Search order, email or phone" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refresh() }} />
      <select className="input" value={filter} onChange={e => { setFilter(e.target.value); setTimeout(refresh, 0) }}><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
      <button className="btn secondary" onClick={refresh}>Refresh</button>
    </div>
    <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{shown.map(o => {
        return <tr key={o.id}>
        <td><Link className="textLink" href={`/admin/orders/${o.id}`}><strong>#{o.orderNumber}</strong></Link><div className="muted">{new Date(o.createdAt).toLocaleString()}</div></td>
        <td><strong>{o.user?.name || `${o.user?.firstName || ''} ${o.user?.lastName || ''}`.trim() || 'Guest'}</strong><div className="muted">{o.email}</div></td>
        <td>{o.items.reduce((a: number, x: any) => a + x.quantity, 0)}</td>
        <td>{money(o.grandTotal, o.currency)}</td>
        <td><span className="pill">{o.paymentStatus}</span><div className="muted">{o.paymentMethod}</div></td>
        <td><span className="pill">{o.status}</span>{o.trackingNumber && <div className="muted">{o.trackingNumber}</div>}</td>
        <td><div className="inline" style={{ gap: 6 }}>
          <Link className="btn ghost smallBtn" href={`/admin/orders/${o.id}`}>View</Link>
          <Link className="btn ghost smallBtn" href={`/admin/orders/${o.id}/invoice`}>Invoice</Link>
          <select className="input compact" disabled={busy === o.id} value={o.status} onChange={e => update(o.id, { status: e.target.value })}>{statuses.map(s => <option key={s} disabled={s !== o.status && !canTransitionOrder(o.status, s as any)}>{s}{s !== o.status && !canTransitionOrder(o.status, s as any) ? ' (not available)' : ''}</option>)}</select>
          <button className="btn ghost smallBtn" disabled={busy === o.id} onClick={() => { const t = prompt('Tracking number', o.trackingNumber || ''); if (t !== null) update(o.id, { trackingNumber: t }) }}>Tracking</button>
          {o.paymentStatus !== 'REFUNDED' && o.status !== 'CANCELLED' && <button className="btn ghost smallBtn" disabled={busy === o.id} onClick={() => { setRefund({ id: o.id, number: o.orderNumber, currency: o.currency, max: o.grandTotal }); setRefundAmount('') }}>Refund</button>}
        </div></td>
      </tr>})}</tbody></table>
    </div>

    {refund && <div className="modalOverlay" onClick={() => setRefund(null)}><div className="card" style={{ width: 'min(440px, 92vw)', padding: 24 }} onClick={e => e.stopPropagation()}>
      <h2 className="h3">Refund #{refund.number}</h2><p className="muted">Maximum refundable: {money(refund.max, refund.currency)}</p>
      <input className="input" autoFocus type="number" min="0.01" step="0.01" placeholder="Refund amount" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
      <div className="inline" style={{ marginTop: 14, justifyContent: 'flex-end' }}><button className="btn secondary" onClick={() => setRefund(null)}>Cancel</button><button className="btn" disabled={busy === refund.id} onClick={doRefund}>{busy === refund.id ? 'Processing…' : 'Issue refund'}</button></div>
    </div></div>}
  </div>
}
