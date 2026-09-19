'use client'
import { useState } from 'react'

type OrderItem = { id: string; name: string; quantity: number; remaining: number }
type ReturnRequest = { id: string; status: string; reason: string; createdAt: string; items: { orderItemId: string; quantity: number }[] }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', APPROVED: 'Approved — awaiting your shipment', RECEIVED: 'Received',
  REFUNDED: 'Refunded', REJECTED: 'Declined', CANCELLED: 'Cancelled',
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function RequestReturn({ orderNumber, items, returns }: { orderNumber: string; items: OrderItem[]; returns: ReturnRequest[] }) {
  const [open, setOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const returnable = items.filter(i => i.remaining > 0)

  function startRequest() {
    setQuantities(Object.fromEntries(returnable.map(i => [i.id, 0])))
    setReason('')
    setError('')
    setOpen(true)
  }

  async function submit() {
    const selected = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (!selected.length) { setError('Choose a quantity for at least one item.'); return }
    if (!reason.trim()) { setError('Please tell us why you want to return these items.'); return }
    setBusy(true); setError('')
    try {
      await api(`/api/account/orders/${encodeURIComponent(orderNumber)}/return`, { method: 'POST', body: JSON.stringify({ items: selected, reason: reason.trim() }) })
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit your return request')
      setBusy(false)
    }
  }

  async function cancelRequest(id: string) {
    if (!confirm('Cancel this return request?')) return
    setBusy(true); setError('')
    try {
      await api(`/api/account/orders/${encodeURIComponent(orderNumber)}/return?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to cancel this return request')
      setBusy(false)
    }
  }

  return <div className="card" style={{ padding: 20, marginTop: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3>Returns</h3>
      {!open && returnable.length > 0 && <button className="btn secondary" type="button" onClick={startRequest}>Request a return</button>}
    </div>

    {error && <p className="muted" style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{error}</p>}

    {returns.length > 0 && <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {returns.map(r => <div key={r.id} className="summaryLine" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>{r.items.reduce((s, i) => s + i.quantity, 0)} item{r.items.reduce((s, i) => s + i.quantity, 0) === 1 ? '' : 's'}</strong>
          <p className="muted" style={{ margin: '2px 0' }}>{r.reason}</p>
          <small className="muted">{new Date(r.createdAt).toLocaleString()}</small>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className="pill">{STATUS_LABEL[r.status] || r.status}</span>
          {r.status === 'REQUESTED' && <button className="textLink" type="button" disabled={busy} onClick={() => cancelRequest(r.id)}>Cancel request</button>}
        </div>
      </div>)}
    </div>}

    {!returns.length && !open && <p className="muted">{returnable.length ? 'Not happy with something? You can request a return above.' : 'No return requests for this order.'}</p>}

    {open && <div style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {returnable.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>{item.name} <span className="muted">({item.remaining} eligible)</span></span>
          <input className="input" type="number" min="0" max={item.remaining} style={{ width: 80 }} value={quantities[item.id] ?? 0} onChange={e => setQuantities(current => ({ ...current, [item.id]: Math.max(0, Math.min(item.remaining, Number(e.target.value) || 0)) }))} />
        </div>)}
      </div>
      <label className="fieldLabel" style={{ marginTop: 12 }}>Reason for return<textarea className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you returning these items?" /></label>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn" type="button" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>}
  </div>
}
