'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, MapPin, Pencil, Save, ShoppingBag, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-draft-orders.module.css'

type DraftOrderItem = { id: string; name: string; sku: string; quantity: number; unitPrice: number; totalPrice: number }
type DraftOrder = {
  id: string; orderNumber: string; email: string; phone: string | null; status: string
  subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; grandTotal: number; currency: string
  shippingAddressJson: string | null; billingAddressJson: string | null; notes: string | null
  completedOrderId: string | null; createdAt: string; updatedAt: string; items: DraftOrderItem[]
}

const EDITABLE_STATUSES = ['DRAFT', 'OPEN', 'CANCELLED'] as const
const STATUS_TONE: Record<string, string> = { DRAFT: '', OPEN: 'warning', COMPLETED: 'success', CANCELLED: 'danger' }

function parseAddress(raw: string | null | undefined) {
  if (!raw) return { line1: '', city: '', region: '', postalCode: '', country: '' }
  try { const a = JSON.parse(raw); return { line1: a.line1 || '', city: a.city || '', region: a.region || '', postalCode: a.postalCode || '', country: a.country || '' } }
  catch { return { line1: raw, city: '', region: '', postalCode: '', country: '' } }
}
function addressText(raw: string | null | undefined) {
  const a = parseAddress(raw)
  return [a.line1, [a.city, a.region, a.postalCode].filter(Boolean).join(', '), a.country].filter(Boolean).join('\n') || '—'
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function DraftOrderDetailAdmin({ initial, canManage }: { initial: DraftOrder; canManage: boolean }) {
  const router = useRouter()
  const [d, setD] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState(d.email)
  const [phone, setPhone] = useState(d.phone || '')
  const [notes, setNotes] = useState(d.notes || '')
  const [statusValue, setStatusValue] = useState(d.status)
  const [shipping, setShipping] = useState(parseAddress(d.shippingAddressJson))
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const itemCount = d.items.reduce((a, x) => a + x.quantity, 0)
  const isFinal = d.status === 'COMPLETED' || d.status === 'CANCELLED'

  function beginEdit() { setEmail(d.email); setPhone(d.phone || ''); setNotes(d.notes || ''); setStatusValue(d.status); setShipping(parseAddress(d.shippingAddressJson)); setEditing(true); setMsg(''); setError('') }
  function cancelEdit() { setEditing(false) }

  async function save() {
    setSaving(true); setError(''); setMsg('')
    try {
      const shippingAddress = (shipping.line1 || shipping.city || shipping.country) ? shipping : undefined
      const data = await api(`/api/admin/draft-orders/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email, phone: phone || null, notes: notes || null, status: statusValue, ...(shippingAddress ? { shippingAddress } : {}) }),
      })
      setD(data.draftOrder); setEditing(false); setMsg('Draft order updated.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update draft order') }
    finally { setSaving(false) }
  }

  async function complete() {
    if (!confirm('Complete this draft order? It will reserve stock and become a real order.')) return
    setBusy(true); setError(''); setMsg('')
    try {
      const data = await api(`/api/admin/draft-orders/${d.id}`, { method: 'POST' })
      router.push(`/admin/orders/${data.order.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete draft order'); setBusy(false) }
  }

  async function cancelDraft() {
    if (!confirm('Cancel this draft order? This cannot be undone.')) return
    setBusy(true); setError(''); setMsg('')
    try {
      await api(`/api/admin/draft-orders/${d.id}`, { method: 'DELETE' })
      setD(current => ({ ...current, status: 'CANCELLED' })); setMsg('Draft order cancelled.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to cancel draft order') }
    finally { setBusy(false) }
  }

  return <div>
    <div className={`sectionHead ${styles.detailHead}`}>
      <div>
        <Link className="textLink" href="/admin/draft-orders"><ArrowLeft size={15} /> Back to draft orders</Link>
        <span className="muted tiny" style={{ display: 'block', marginTop: 12 }}>DRAFT ORDER</span>
        <h1 className="h2">{d.orderNumber}</h1>
        <p className="muted">Created {new Date(d.createdAt).toLocaleString()}</p>
      </div>
      <div className="inline">
        <span className={`statusPill ${STATUS_TONE[d.status] || ''}`}>{d.status}</span>
        {canManage && !isFinal && <button className="btn secondary" onClick={beginEdit}><Pencil size={15} /> Edit</button>}
        {canManage && !isFinal && <button className="btn" onClick={complete} disabled={busy}><Check size={15} /> {busy ? 'Working…' : 'Complete order'}</button>}
        {canManage && !isFinal && <button className={styles.dangerBtn} onClick={cancelDraft} disabled={busy}><X size={15} /> Cancel</button>}
      </div>
    </div>

    {msg && <div className="alert">{msg}</div>}
    {error && <div className="alert danger">{error}</div>}

    {d.status === 'COMPLETED' && d.completedOrderId && <div className="alert">This draft was completed. <Link className="textLink" href={`/admin/orders/${d.completedOrderId}`}>View the resulting order</Link>.</div>}

    {editing && <section className="orderEditToolbar">
      <div><strong>Edit draft order</strong><div className="muted" style={{ fontSize: 12 }}>Update contact details, status, shipping address and staff notes.</div></div>
      <div className="inline"><button className="btn ghost" onClick={cancelEdit} disabled={saving}><X size={15} /> Cancel</button><button className="btn" onClick={save} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button></div>
    </section>}

    <div className="orderDetailGrid">
      <main className="orderDetailMain">
        <section className="card adminPanel">
          <div className="sectionHead small"><h3>Items</h3><span className="muted">{itemCount} items</span></div>
          {d.items.map(x => <div className={styles.itemRow} key={x.id}>
            <div><strong>{x.name}</strong><div className="muted">{x.sku}</div></div>
            <span>× {x.quantity}</span>
            <span className="muted">{money(x.unitPrice, d.currency)} each</span>
            <strong>{money(x.totalPrice, d.currency)}</strong>
          </div>)}
          {!d.items.length && <p className="muted">No items on this draft order.</p>}
          <div className="summaryBox">
            <div><span>Subtotal</span><strong>{money(d.subtotal, d.currency)}</strong></div>
            <div><span>Discount</span><strong>- {money(d.discountTotal, d.currency)}</strong></div>
            <div><span>Shipping</span><strong>{money(d.shippingTotal, d.currency)}</strong></div>
            <div><span>Tax</span><strong>{money(d.taxTotal, d.currency)}</strong></div>
            <div className="total"><span>Total</span><strong>{money(d.grandTotal, d.currency)}</strong></div>
          </div>
        </section>

        <section className="card adminPanel">
          <div className="sectionHead small"><h3>Customer</h3></div>
          {editing ? <div className="twoColFields">
            <label className="fieldLabel">Email<input className="input" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label className="fieldLabel">Phone<input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          </div> : <><strong>{d.email}</strong>{d.phone && <p className="muted">{d.phone}</p>}</>}
        </section>

        <section className="card adminPanel">
          <div className="sectionHead small"><h3>Shipping address</h3></div>
          {editing ? <div className="editAddressGrid">
            <label className="fieldLabel full">Address<input className="input" value={shipping.line1} onChange={e => setShipping({ ...shipping, line1: e.target.value })} /></label>
            <label className="fieldLabel">City<input className="input" value={shipping.city} onChange={e => setShipping({ ...shipping, city: e.target.value })} /></label>
            <label className="fieldLabel">Region<input className="input" value={shipping.region} onChange={e => setShipping({ ...shipping, region: e.target.value })} /></label>
            <label className="fieldLabel">Postal code<input className="input" value={shipping.postalCode} onChange={e => setShipping({ ...shipping, postalCode: e.target.value })} /></label>
            <label className="fieldLabel">Country<input className="input" value={shipping.country} onChange={e => setShipping({ ...shipping, country: e.target.value })} /></label>
          </div> : <div className="muted" style={{ whiteSpace: 'pre-wrap' }}><MapPin size={13} /> {addressText(d.shippingAddressJson)}</div>}
        </section>

        {editing && <section className="card adminPanel"><div className="sectionHead small"><h3>Internal note</h3></div><textarea className="textarea" rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add an internal note…" /></section>}
        {!editing && d.notes && <section className="card adminPanel"><div className="sectionHead small"><h3>Internal note</h3></div><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</p></section>}
      </main>

      <aside className="orderDetailRail">
        {editing && <section className="card adminPanel">
          <div className="sectionHead small"><h3>Status</h3></div>
          <label className="fieldLabel">Draft status<select className="input" value={statusValue} onChange={e => setStatusValue(e.target.value)}>{EDITABLE_STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
          <p className="fieldHelp">Completing an order is a separate action — it reserves stock and creates a real order.</p>
        </section>}
        <section className="card adminPanel">
          <div className="sectionHead small"><h3>Draft information</h3></div>
          <div className="summaryLine"><span>Currency</span><strong>{d.currency}</strong></div>
          <div className="summaryLine"><span>Created</span><strong>{new Date(d.createdAt).toLocaleDateString()}</strong></div>
          <div className="summaryLine"><span>Updated</span><strong>{new Date(d.updatedAt).toLocaleString()}</strong></div>
        </section>
        {d.status === 'COMPLETED' && d.completedOrderId && <section className="card adminPanel"><div className="sectionHead small"><h3>Resulting order</h3></div><Link className="btn secondary wide" href={`/admin/orders/${d.completedOrderId}`}><ShoppingBag size={15} /> View order</Link></section>}
      </aside>
    </div>
  </div>
}
