'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, MapPin, Phone, Save, ShieldOff, UserCheck, Plus, X, CreditCard, UsersRound, Coins } from 'lucide-react'
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
  const [tagInput, setTagInput] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditBusy, setCreditBusy] = useState(false)
  const [coinAmount, setCoinAmount] = useState('')
  const [coinReason, setCoinReason] = useState('')
  const [coinBusy, setCoinBusy] = useState(false)

  async function save() {
    setSaving(true); setMessage(''); setError('')
    try {
      const data = await api(`/api/admin/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify({ name: customer.name, email: customer.email, phone: customer.phone, isActive: customer.isActive }) })
      setCustomer({ ...customer, ...data.customer }); setMessage('Customer saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save customer') }
    finally { setSaving(false) }
  }

  async function addTag(value = tagInput) {
    const tag = value.trim()
    if (!tag) return
    try {
      const data = await api(`/api/admin/customers/${customer.id}/tags`, { method: 'POST', body: JSON.stringify({ value: tag }) })
      setCustomer((c: any) => ({ ...c, tags: [data.tag, ...(c.tags || []).filter((x: any) => x.id !== data.tag.id)] }))
      setTagInput(''); setMessage(`Added tag “${tag}”`); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add tag') }
  }

  async function removeTag(tagId: string) {
    try { await api(`/api/admin/customers/${customer.id}/tags`, { method: 'DELETE', body: JSON.stringify({ tagId }) }); setCustomer((c: any) => ({ ...c, tags: (c.tags || []).filter((x: any) => x.id !== tagId) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to remove tag') }
  }

  async function addSegment() {
    if (!segmentId) return
    try {
      const data = await api(`/api/admin/customers/${customer.id}/segments`, { method: 'POST', body: JSON.stringify({ segmentId }) })
      setCustomer((c: any) => ({ ...c, segments: [data.segment, ...(c.segments || []).filter((x: any) => x.id !== data.segment.id)] }))
      setSegmentId(''); setMessage('Customer segment updated'); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add segment') }
  }

  async function removeSegment(id: string) {
    try { await api(`/api/admin/customers/${customer.id}/segments`, { method: 'DELETE', body: JSON.stringify({ segmentId: id }) }); setCustomer((c: any) => ({ ...c, segments: (c.segments || []).filter((x: any) => x.id !== id) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to remove segment') }
  }

  async function adjustCredit() {
    const entered = Number(creditAmount)
    if (!Number.isFinite(entered) || entered === 0) return setError('Enter a non-zero credit amount.')
    setCreditBusy(true); setError('')
    try {
      const minor = Math.round(entered * 100)
      const data = await api(`/api/admin/customers/${customer.id}/credit`, { method: 'POST', body: JSON.stringify({ amount: minor, currency: customer.orders?.[0]?.currency || 'USD', reason: creditReason || 'Admin adjustment' }) })
      setCustomer((c: any) => ({ ...c, creditBalance: data.balance, creditTransactions: [data.transaction, ...(c.creditTransactions || [])] }))
      setCreditAmount(''); setCreditReason(''); setMessage('Wallet updated')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to adjust wallet') }
    finally { setCreditBusy(false) }
  }

  async function adjustCoins() {
    const entered = Number(coinAmount)
    if (!Number.isInteger(entered) || entered === 0) return setError('Enter a non-zero whole-number coin adjustment.')
    setCoinBusy(true); setError('')
    try {
      const data = await api(`/api/admin/customers/${customer.id}/coins`, { method: 'POST', body: JSON.stringify({ amount: entered, reason: coinReason || 'Admin adjustment' }) })
      setCustomer((c: any) => ({ ...c, coinBalance: data.balance, coinTransactions: [data.transaction, ...(c.coinTransactions || [])] }))
      setCoinAmount(''); setCoinReason(''); setMessage('Coins updated')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to adjust coins') }
    finally { setCoinBusy(false) }
  }

  const totalOrders = customer.orders?.length || 0
  const totalSpent = customer.orderTotal || 0
  const average = totalOrders ? Math.round(totalSpent / totalOrders) : 0
  const usedTagValues = new Set((customer.tags || []).map((x: any) => x.value))
  const availableTags = (customer.availableTags || []).filter((x: any) => !usedTagValues.has(x.value))
  const usedSegments = new Set((customer.segments || []).map((x: any) => x.id))
  const availableSegments = (customer.availableSegments || []).filter((x: any) => !usedSegments.has(x.id))

  return <div className="customerDetailPage">
    <div className="editorTopbar"><div className="editorTopLeft"><Link href="/admin/customers" className="iconBtn"><ArrowLeft size={18}/></Link><div><div className="muted tiny">CUSTOMER</div><h1 className="editorTitle">{customer.name}</h1></div></div><div className="editorTopActions"><span className={customer.isActive ? 'statusPill active' : 'statusPill archived'}>{customer.isActive ? <UserCheck size={13}/> : <ShieldOff size={13}/>} {customer.isActive ? 'Active' : 'Disabled'}</span><button className="btn" onClick={save} disabled={saving}><Save size={16}/> {saving ? 'Saving…' : 'Save'}</button></div></div>
    {(error || message) && <div className={error ? 'alert danger' : 'alert'}>{error || message}</div>}

    <div className="card customerHero"><div className="customerHeroAvatar">{initials(customer.name)}</div><div className="customerHeroInfo"><h2>{customer.name}</h2><div className="muted">Customer since {new Date(customer.createdAt).toLocaleDateString()}</div><div className="inline customerContacts"><span className="muted"><Mail size={14}/> {customer.email}</span>{customer.phone && <span className="muted"><Phone size={14}/> {customer.phone}</span>}</div></div><div className="customerHeroActions"><a className="btn secondary" href={`mailto:${customer.email}`}><Mail size={15}/> Email</a>{customer.phone && <a className="btn secondary" href={`tel:${customer.phone}`}><Phone size={15}/> Call</a>}</div></div>

    <div className="accountStats"><div className="card stat"><span className="muted">Total spent</span><strong>{money(totalSpent)}</strong></div><div className="card stat"><span className="muted">Orders</span><strong>{totalOrders}</strong></div><div className="card stat"><span className="muted">Average order</span><strong>{money(average)}</strong></div><div className="card stat"><span className="muted">Wallet</span><strong>{money(customer.creditBalance || 0)}</strong></div><div className="card stat"><span className="muted">Coins</span><strong>{Number(customer.coinBalance || 0).toLocaleString()}</strong></div></div>

    <div className="customerWorkspace"><main className="customerMain">
      <section className="editorCard"><div className="editorCardHead"><div><h3>Customer information</h3><p>Contact details used across orders and account communications.</p></div></div><div className="editorCardBody"><div className="twoColFields"><label className="fieldLabel">Full name<input className="input" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })}/></label><label className="fieldLabel">Email<input className="input" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })}/></label><label className="fieldLabel">Phone<input className="input" value={customer.phone || ''} onChange={e => setCustomer({ ...customer, phone: e.target.value })}/></label><label className="fieldLabel">Account status<select className="input" value={customer.isActive ? 'ACTIVE' : 'DISABLED'} onChange={e => setCustomer({ ...customer, isActive: e.target.value === 'ACTIVE' })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label></div></div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Tags & segments</h3><p>Organize this customer for filtering, marketing and operational workflows.</p></div></div><div className="editorCardBody"><div className="tagCloud">{(customer.tags || []).map((tag: any) => <span className="customerTag" key={tag.id}>{tag.value}<button type="button" onClick={() => removeTag(tag.id)} aria-label={`Remove ${tag.value}`}><X size={12}/></button></span>)}{!(customer.tags || []).length && <span className="muted">No tags yet.</span>}</div><div className="inline addControlRow"><input className="input" placeholder="Add tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addTag() } }}/><button className="btn secondary" onClick={() => addTag()} disabled={!tagInput.trim()}><Plus size={15}/> Add tag</button>{availableTags.slice(0, 6).map((tag: any) => <button className="chipButton" type="button" key={tag.id} onClick={() => addTag(tag.value)}>+ {tag.value}</button>)}</div><div className="segmentRows">{(customer.segments || []).map((seg: any) => <div className="segmentRow" key={seg.id}><div><strong>{seg.name}</strong><div className="muted">{seg.description || 'Customer segment'}</div></div><button className="iconBtn" onClick={() => removeSegment(seg.id)} title="Remove segment"><X size={14}/></button></div>)}{!(customer.segments || []).length && <span className="muted">No segments assigned.</span>}</div><div className="inline addControlRow"><select className="input" value={segmentId} onChange={e => setSegmentId(e.target.value)}><option value="">Add to a segment…</option>{availableSegments.map((seg: any) => <option value={seg.id} key={seg.id}>{seg.name}</option>)}</select><button className="btn secondary" onClick={addSegment} disabled={!segmentId}><UsersRound size={15}/> Add segment</button></div></div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Order history</h3><p>Every order linked to this customer.</p></div><Link className="btn secondary" href="/admin/orders">View all orders</Link></div><div className="editorCardBody">{!customer.orders?.length ? <div className="emptyInline">No orders yet.</div> : <div className="tableWrap"><table className="table"><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th><th>Date</th></tr></thead><tbody>{customer.orders.slice(0, 25).map((o: any) => <tr key={o.id}><td><Link className="textLink" href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td><td><span className="pill">{o.status}</span></td><td><span className="pill">{o.paymentStatus}</span></td><td><strong>{money(o.grandTotal, o.currency)}</strong></td><td>{new Date(o.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Reviews</h3><p>Reviews written by this customer.</p></div></div><div className="editorCardBody">{!customer.reviews?.length ? <div className="emptyInline">No reviews yet.</div> : customer.reviews.map((r: any) => <div key={r.id} className="reviewRow"><div className="inline" style={{ justifyContent: 'space-between' }}><strong>{r.product?.name}</strong><span>{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}</span></div>{r.title && <strong className="reviewTitle">{r.title}</strong>}<div className="muted">{r.body || 'No review text'}</div></div>)}</div></section>
    </main>

    <aside className="customerRail">
      <section className="editorCard"><div className="editorCardHead"><div><h3>Wallet</h3><p>Store credit balance with a protected ledger.</p></div><CreditCard size={18}/></div><div className="editorCardBody"><div className="creditBalance">{money(customer.creditBalance || 0)}<span>available wallet balance</span></div><div className="twoColFields"><label className="fieldLabel">Adjustment<input className="input" type="number" step="0.01" placeholder="+50 or -25" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}/></label><label className="fieldLabel">Reason<input className="input" value={creditReason} onChange={e => setCreditReason(e.target.value)} placeholder="Customer goodwill"/></label></div><button className="btn" onClick={adjustCredit} disabled={creditBusy || !creditAmount}>{creditBusy ? 'Updating…' : 'Adjust wallet'}</button><div className="creditHistory">{(customer.creditTransactions || []).slice(0, 8).map((tx: any) => <div className="summaryLine" key={tx.id}><span>{tx.reason || tx.type}<small className="muted">{new Date(tx.createdAt).toLocaleDateString()}</small></span><strong className={tx.amount >= 0 ? 'creditPositive' : 'creditNegative'}>{tx.amount >= 0 ? '+' : ''}{money(tx.amount, tx.currency)}</strong></div>)}</div></div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Coins</h3><p>1 coin redeems as 0.01 store currency unit.</p></div><Coins size={18}/></div><div className="editorCardBody"><div className="creditBalance">{Number(customer.coinBalance || 0).toLocaleString()}<span>available coins</span></div><div className="twoColFields"><label className="fieldLabel">Adjustment<input className="input" type="number" step="1" placeholder="+500 or -100" value={coinAmount} onChange={e => setCoinAmount(e.target.value)}/></label><label className="fieldLabel">Reason<input className="input" value={coinReason} onChange={e => setCoinReason(e.target.value)} placeholder="Loyalty bonus"/></label></div><button className="btn" onClick={adjustCoins} disabled={coinBusy || !coinAmount}>{coinBusy ? 'Updating…' : 'Adjust coins'}</button><div className="creditHistory">{(customer.coinTransactions || []).slice(0, 8).map((tx: any) => <div className="summaryLine" key={tx.id}><span>{tx.reason || tx.type}<small className="muted">{new Date(tx.createdAt).toLocaleDateString()}</small></span><strong className={tx.amount >= 0 ? 'creditPositive' : 'creditNegative'}>{tx.amount >= 0 ? '+' : ''}{tx.amount}</strong></div>)}</div></div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Addresses</h3><p>Saved customer addresses.</p></div></div><div className="editorCardBody">{!customer.addresses?.length ? <div className="emptyInline">No saved addresses.</div> : customer.addresses.map((a: any) => <div className="addressItem" key={a.id}><div className="inline"><MapPin size={15}/><strong>{a.label || 'Address'}</strong>{a.isDefault && <span className="pill">Default</span>}</div><div>{a.firstName} {a.lastName}</div><div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div><div>{a.city}{a.region ? `, ${a.region}` : ''} {a.postalCode || ''}</div><div>{a.country}</div></div>)}</div></section>

      <section className="editorCard"><div className="editorCardHead"><div><h3>Account</h3><p>Customer login information.</p></div></div><div className="editorCardBody"><div className="summaryLine"><span>Status</span><strong>{customer.isActive ? 'Active' : 'Disabled'}</strong></div><div className="summaryLine"><span>Last login</span><strong>{customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleDateString() : 'Never'}</strong></div><div className="summaryLine"><span>Reviews</span><strong>{customer._count?.reviews || 0}</strong></div></div></section>
    </aside></div>
  </div>
}
