'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Mail, MapPin, Phone, Save, ShieldOff, UserCheck } from 'lucide-react'
import { money } from '@/lib/config'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || '').join('') || '?'

export default function CustomerDetailAdmin({ initial }: { initial: any }) {
  const [customer, setCustomer] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setMessage(''); setError('')
    try {
      const data = await api(`/api/admin/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify({ name: customer.name, email: customer.email, phone: customer.phone, isActive: customer.isActive }) })
      setCustomer({ ...customer, ...data.customer }); setMessage('Customer saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save customer') }
    finally { setSaving(false) }
  }

  const totalOrders = customer.orders?.length || 0
  const totalSpent = customer.orderTotal || 0
  const average = totalOrders ? Math.round(totalSpent / totalOrders) : 0

  return <div className="customerDetailPage">
    <div className="editorTopbar"><div className="editorTopLeft"><Link href="/admin/customers" className="iconBtn"><ArrowLeft size={18}/></Link><div><div className="muted tiny">CUSTOMER</div><h1 className="editorTitle">{customer.name}</h1></div></div><div className="editorTopActions"><span className={customer.isActive ? 'statusPill active' : 'statusPill archived'}>{customer.isActive ? <UserCheck size={13}/> : <ShieldOff size={13}/>} {customer.isActive ? 'Active' : 'Disabled'}</span><button className="btn" onClick={save} disabled={saving}><Save size={16}/> {saving ? 'Saving…' : 'Save'}</button></div></div>
    {(error || message) && <div className={error ? 'alert danger' : 'alert'} style={{ margin: '0 24px 14px' }}>{error || message}</div>}
    <div className="customerProfileHead card"><div className="customerAvatar large">{initials(customer.name)}</div><div className="customerHeroInfo"><h2>{customer.name}</h2><div className="muted">Customer since {new Date(customer.createdAt).toLocaleDateString()}</div><div className="inline customerContactLine"><span><Mail size={14}/> {customer.email}</span>{customer.phone && <span><Phone size={14}/> {customer.phone}</span>}</div></div></div>

    <div className="accountStats"><div className="card stat"><span className="muted">Total spent</span><strong>{money(totalSpent)}</strong></div><div className="card stat"><span className="muted">Orders</span><strong>{totalOrders}</strong></div><div className="card stat"><span className="muted">Average order</span><strong>{money(average)}</strong></div></div>

    <div className="customerGrid">
      <main className="customerMain">
        <section className="editorCard"><div className="editorCardHead"><div><h3>Customer information</h3><p>Contact details used across orders and account communications.</p></div></div><div className="editorCardBody"><div className="twoColFields"><label className="fieldLabel">Full name<input className="input" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })}/></label><label className="fieldLabel">Email<input className="input" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })}/></label><label className="fieldLabel">Phone<input className="input" value={customer.phone || ''} onChange={e => setCustomer({ ...customer, phone: e.target.value })}/></label><label className="fieldLabel">Account status<select className="input" value={customer.isActive ? 'ACTIVE' : 'DISABLED'} onChange={e => setCustomer({ ...customer, isActive: e.target.value === 'ACTIVE' })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label></div></div></section>
        <section className="editorCard"><div className="editorCardHead"><div><h3>Order history</h3><p>Every order linked to this customer.</p></div></div><div className="editorCardBody">{!customer.orders?.length ? <div className="emptyInline">No orders yet.</div> : <div className="tableWrap"><table className="table"><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th><th>Date</th></tr></thead><tbody>{customer.orders.map((o: any) => <tr key={o.id}><td><Link className="textLink" href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td><td><span className="pill">{o.status}</span></td><td><span className="pill">{o.paymentStatus}</span></td><td><strong>{money(o.grandTotal, o.currency)}</strong></td><td>{new Date(o.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</div></section>
        <section className="editorCard"><div className="editorCardHead"><div><h3>Reviews</h3><p>Reviews written by this customer.</p></div></div><div className="editorCardBody">{!customer.reviews?.length ? <div className="emptyInline">No reviews yet.</div> : customer.reviews.map((r: any) => <div className="customerReview" key={r.id}><div className="inline" style={{ justifyContent: 'space-between' }}><strong>{r.product?.name}</strong><span>{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}</span></div>{r.title && <strong>{r.title}</strong>}<div className="muted">{r.body || 'No review text'}</div></div>)}</div></section>
      </main>
      <aside className="customerRail"><section className="editorCard"><div className="editorCardHead"><div><h3>Contact</h3><p>Quick actions</p></div></div><div className="editorCardBody"><a className="btn secondary" href={`mailto:${customer.email}`}><Mail size={15}/> Email customer</a>{customer.phone && <a className="btn secondary" href={`tel:${customer.phone}`}><Phone size={15}/> Call customer</a>}</div></section><section className="editorCard"><div className="editorCardHead"><div><h3>Addresses</h3><p>Saved customer addresses.</p></div></div><div className="editorCardBody">{!customer.addresses?.length ? <div className="emptyInline">No saved addresses.</div> : customer.addresses.map((a: any) => <div className="addressCard" key={a.id}><div className="inline"><MapPin size={15}/><strong>{a.label || 'Address'}</strong>{a.isDefault && <span className="pill">Default</span>}</div><div>{a.firstName} {a.lastName}</div><div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div><div>{a.city}{a.region ? `, ${a.region}` : ''} {a.postalCode || ''}</div><div>{a.country}</div></div>)}</div></section><section className="editorCard"><div className="editorCardHead"><div><h3>Account</h3><p>Customer login information.</p></div></div><div className="editorCardBody"><div className="summaryLine"><span>Status</span><strong>{customer.isActive ? 'Active' : 'Disabled'}</strong></div><div className="summaryLine"><span>Last login</span><strong>{customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleDateString() : 'Never'}</strong></div><div className="summaryLine"><span>Reviews</span><strong>{customer._count?.reviews || 0}</strong></div></div></section></aside>
    </div>
  </div>
}
