'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, MapPin, Phone, Save, ShieldOff, UserCheck, Plus, X, CreditCard, UsersRound, Coins } from 'lucide-react'
import { money } from '@/lib/config'
import s from './admin-customer-detail.module.css'
import ui from './admin-ui.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || '').join('') || '?'

type ProfileFields = { name: string; email: string; phone: string | null; isActive: boolean }

export default function CustomerDetailAdmin({ initial }: { initial: any }) {
  const [customer, setCustomer] = useState(initial)
  const [original, setOriginal] = useState<ProfileFields>({ name: initial.name, email: initial.email, phone: initial.phone, isActive: initial.isActive })
  const [dirty, setDirty] = useState(false)
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

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function updateProfile(patch: Partial<ProfileFields>) {
    setCustomer((c: any) => ({ ...c, ...patch }))
    setDirty(true)
    setMessage('')
  }

  async function save() {
    // Only ship the fields that actually changed -- resubmitting every field on every
    // save (as this page used to) means an unconditional user.update write plus an email
    // uniqueness lookup on the server even when the email never changed, on every click.
    const patch: Record<string, unknown> = {}
    if (customer.name !== original.name) patch.name = customer.name
    if (customer.email !== original.email) patch.email = customer.email
    if ((customer.phone || '') !== (original.phone || '')) patch.phone = customer.phone
    if (customer.isActive !== original.isActive) patch.isActive = customer.isActive
    if (!Object.keys(patch).length) { setDirty(false); setMessage('No changes to save'); return }

    setSaving(true); setMessage(''); setError('')
    try {
      const data = await api(`/api/admin/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      setCustomer((c: any) => ({ ...c, ...data.customer }))
      setOriginal({ name: data.customer.name, email: data.customer.email, phone: data.customer.phone, isActive: data.customer.isActive })
      setDirty(false)
      setMessage('Customer saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save customer') }
    finally { setSaving(false) }
  }

  async function addTag(value = tagInput) {
    const tag = value.trim()
    if (!tag) return
    try {
      const data = await api(`/api/admin/customers/${customer.id}/tags`, { method: 'POST', body: JSON.stringify({ value: tag }) })
      setCustomer((c: any) => ({ ...c, tags: [data.tag, ...(c.tags || []).filter((x: any) => x.id !== data.tag.id)] }))
      setTagInput(''); setMessage(`Added tag "${tag}"`); setError('')
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

  const orders: any[] = customer.orders || []
  const totalOrders = orders.length
  const billableOrders = orders.filter((o: any) => o.status !== 'CANCELLED').length
  const totalSpent = customer.orderTotal || 0
  // Average order value is spend-per-order among orders that actually counted toward
  // totalSpent (sumCustomerSpend excludes cancelled orders) -- dividing by every order
  // including cancelled ones understated this whenever a customer had a cancellation.
  const average = billableOrders ? Math.round(totalSpent / billableOrders) : 0
  const usedTagValues = new Set((customer.tags || []).map((x: any) => x.value))
  const availableTags = (customer.availableTags || []).filter((x: any) => !usedTagValues.has(x.value))
  const usedSegments = new Set((customer.segments || []).map((x: any) => x.id))
  const availableSegments = (customer.availableSegments || []).filter((x: any) => !usedSegments.has(x.id))

  return <div className={s.page}>
    <div className={s.topbar}>
      <div className={s.topLeft}>
        <Link href="/admin/customers" className={ui.iconBtn} onClick={e => { if (dirty && !confirm('Discard unsaved changes?')) e.preventDefault() }}><ArrowLeft size={18}/></Link>
        <div><div className={`${ui.muted} ${ui.tiny}`}>CUSTOMER</div><h1 className={s.title}>{customer.name}</h1>{dirty && <div className={`${ui.muted} ${ui.tiny}`}>Unsaved changes</div>}</div>
      </div>
      <div className={s.topActions}>
        <span className={`${ui.statusPill} ${customer.isActive ? ui.statusPillSuccess : ''}`}>{customer.isActive ? <UserCheck size={13}/> : <ShieldOff size={13}/>} {customer.isActive ? 'Active' : 'Disabled'}</span>
        <button className={ui.btn} onClick={save} disabled={saving}><Save size={16}/> {saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
    {(error || message) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''} ${s.alert}`}>{error || message}</div>}

    <div className={`${ui.card} ${s.hero}`}>
      <div className={s.heroAvatar}>{initials(customer.name)}</div>
      <div className={s.heroInfo}>
        <h2>{customer.name}</h2>
        <div className={ui.muted}>Customer since {new Date(customer.createdAt).toLocaleDateString()}</div>
        <div className={s.heroContacts}><span className={ui.muted}><Mail size={14}/> {customer.email}</span>{customer.phone && <span className={ui.muted}><Phone size={14}/> {customer.phone}</span>}</div>
      </div>
      <div className={s.heroActions}>
        <a className={`${ui.btn} ${ui.btnSecondary}`} href={`mailto:${customer.email}`}><Mail size={15}/> Email</a>
        {customer.phone && <a className={`${ui.btn} ${ui.btnSecondary}`} href={`tel:${customer.phone}`}><Phone size={15}/> Call</a>}
      </div>
    </div>

    <div className={s.stats}>
      <div className={`${ui.card} ${s.statCard}`}><span className={ui.muted}>Total spent</span><strong>{money(totalSpent)}</strong></div>
      <div className={`${ui.card} ${s.statCard}`}><span className={ui.muted}>Orders</span><strong>{totalOrders}</strong></div>
      <div className={`${ui.card} ${s.statCard}`}><span className={ui.muted}>Average order</span><strong>{money(average)}</strong></div>
      <div className={`${ui.card} ${s.statCard}`}><span className={ui.muted}>Wallet</span><strong>{money(customer.creditBalance || 0)}</strong></div>
      <div className={`${ui.card} ${s.statCard}`}><span className={ui.muted}>Coins</span><strong>{Number(customer.coinBalance || 0).toLocaleString()}</strong></div>
    </div>

    <div className={s.workspace}>
      <main className={s.main}>
        <Card title="Customer information" sub="Contact details used across orders and account communications.">
          <div className={s.twoCol}>
            <label className={s.field}>Full name<input className={ui.input} value={customer.name} onChange={e => updateProfile({ name: e.target.value })}/></label>
            <label className={s.field}>Email<input className={ui.input} value={customer.email} onChange={e => updateProfile({ email: e.target.value })}/></label>
            <label className={s.field}>Phone<input className={ui.input} value={customer.phone || ''} onChange={e => updateProfile({ phone: e.target.value })}/></label>
            <label className={s.field}>Account status<select className={ui.select} value={customer.isActive ? 'ACTIVE' : 'DISABLED'} onChange={e => updateProfile({ isActive: e.target.value === 'ACTIVE' })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label>
          </div>
        </Card>

        <Card title="Tags & segments" sub="Organize this customer for filtering, marketing and operational workflows.">
          <div className={s.tagCloud}>
            {(customer.tags || []).map((tag: any) => <span className={s.tagChip} key={tag.id}>{tag.value}<button type="button" onClick={() => removeTag(tag.id)} aria-label={`Remove ${tag.value}`}><X size={12}/></button></span>)}
            {!(customer.tags || []).length && <span className={ui.muted}>No tags yet.</span>}
          </div>
          <div className={s.addRow}>
            <input className={`${ui.input} ${s.addRowField}`} placeholder="Add tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addTag() } }}/>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => addTag()} disabled={!tagInput.trim()}><Plus size={15}/> Add tag</button>
            {availableTags.slice(0, 6).map((tag: any) => <button className={s.chipButton} type="button" key={tag.id} onClick={() => addTag(tag.value)}>+ {tag.value}</button>)}
          </div>
          <div className={s.segmentRows}>
            {(customer.segments || []).map((seg: any) => <div className={s.segmentRow} key={seg.id}><div><strong>{seg.name}</strong><div>{seg.description || 'Customer segment'}</div></div><button className={ui.iconBtn} onClick={() => removeSegment(seg.id)} title="Remove segment"><X size={14}/></button></div>)}
            {!(customer.segments || []).length && <span className={ui.muted}>No segments assigned.</span>}
          </div>
          <div className={s.addRow}>
            <select className={`${ui.select} ${s.addRowField}`} value={segmentId} onChange={e => setSegmentId(e.target.value)}><option value="">Add to a segment…</option>{availableSegments.map((seg: any) => <option value={seg.id} key={seg.id}>{seg.name}</option>)}</select>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addSegment} disabled={!segmentId}><UsersRound size={15}/> Add segment</button>
          </div>
          <Link href="/admin/customer-segments" className={s.link}>Manage segments</Link>
        </Card>

        <Card title="Order history" sub="Every order linked to this customer." action={<Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders">View all orders</Link>}>
          {!orders.length ? <div className={s.emptyInline}>No orders yet.</div> : <div className={s.tableWrap}><table className={ui.table}><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th><th>Date</th></tr></thead><tbody>{orders.slice(0, 25).map((o: any) => <tr key={o.id}><td><Link className={s.link} href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td><td><span className={ui.pill}>{o.status}</span></td><td><span className={ui.pill}>{o.paymentStatus}</span></td><td><strong>{money(o.grandTotal, o.currency)}</strong></td><td>{new Date(o.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        </Card>

        <Card title="Reviews" sub="Reviews written by this customer.">
          {!customer.reviews?.length ? <div className={s.emptyInline}>No reviews yet.</div> : customer.reviews.map((r: any) => <div key={r.id} className={s.reviewRow}>
            <div className={s.reviewRowHead}>
              <strong>{r.product?.name}</strong>
              <span className={s.stars}>{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}{'☆'.repeat(Math.max(0, 5 - r.rating))}</span>
            </div>
            {r.title && <strong className={s.reviewTitle}>{r.title}</strong>}
            <div className={s.reviewBody}>{r.body || 'No review text'}</div>
            <span className={r.approved ? s.pillApproved : s.pillPending}>{r.approved ? 'Approved' : 'Pending approval'}</span>
          </div>)}
        </Card>
      </main>

      <aside className={s.rail}>
        <Card title="Wallet" sub="Store credit balance with a protected ledger." icon={<CreditCard size={18}/>}>
          <div className={s.balance}>{money(customer.creditBalance || 0)}<span>available wallet balance</span></div>
          <div className={s.twoCol}>
            <label className={s.field}>Adjustment<input className={ui.input} type="number" step="0.01" placeholder="+50 or -25" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}/></label>
            <label className={s.field}>Reason<input className={ui.input} value={creditReason} onChange={e => setCreditReason(e.target.value)} placeholder="Customer goodwill"/></label>
          </div>
          <button className={ui.btn} onClick={adjustCredit} disabled={creditBusy || !creditAmount}>{creditBusy ? 'Updating…' : 'Adjust wallet'}</button>
          <div className={s.history}>{(customer.creditTransactions || []).slice(0, 8).map((tx: any) => <div className={s.historyRow} key={tx.id}><span>{tx.reason || tx.type}<small>{new Date(tx.createdAt).toLocaleDateString()}</small></span><strong className={tx.amount >= 0 ? s.amountPositive : s.amountNegative}>{tx.amount >= 0 ? '+' : ''}{money(tx.amount, tx.currency)}</strong></div>)}
          {!(customer.creditTransactions || []).length && <span className={ui.muted}>No wallet activity yet.</span>}</div>
        </Card>

        <Card title="Coins" sub="1 coin redeems as 0.01 store currency unit." icon={<Coins size={18}/>}>
          <div className={s.balance}>{Number(customer.coinBalance || 0).toLocaleString()}<span>available coins</span></div>
          <div className={s.twoCol}>
            <label className={s.field}>Adjustment<input className={ui.input} type="number" step="1" placeholder="+500 or -100" value={coinAmount} onChange={e => setCoinAmount(e.target.value)}/></label>
            <label className={s.field}>Reason<input className={ui.input} value={coinReason} onChange={e => setCoinReason(e.target.value)} placeholder="Loyalty bonus"/></label>
          </div>
          <button className={ui.btn} onClick={adjustCoins} disabled={coinBusy || !coinAmount}>{coinBusy ? 'Updating…' : 'Adjust coins'}</button>
          <div className={s.history}>{(customer.coinTransactions || []).slice(0, 8).map((tx: any) => <div className={s.historyRow} key={tx.id}><span>{tx.reason || tx.type}<small>{new Date(tx.createdAt).toLocaleDateString()}</small></span><strong className={tx.amount >= 0 ? s.amountPositive : s.amountNegative}>{tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString()}</strong></div>)}
          {!(customer.coinTransactions || []).length && <span className={ui.muted}>No coin activity yet.</span>}</div>
        </Card>

        <Card title="Addresses" sub="Saved customer addresses.">
          {!customer.addresses?.length ? <div className={s.emptyInline}>No saved addresses.</div> : <div className={s.addressList}>{customer.addresses.map((a: any) => <div className={s.addressItem} key={a.id}>
            <div className={s.addressHead}><MapPin size={15}/><span>{a.label || 'Address'}</span>{a.isDefault && <span className={ui.pill}>Default</span>}</div>
            <div>{a.firstName} {a.lastName}</div>
            <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
            <div>{a.city}{a.region ? `, ${a.region}` : ''} {a.postalCode || ''}</div>
            <div>{a.country}</div>
          </div>)}</div>}
        </Card>

        <Card title="Account" sub="Customer login information.">
          <div className={s.summaryLine}><span>Status</span><strong>{customer.isActive ? 'Active' : 'Disabled'}</strong></div>
          <div className={s.summaryLine}><span>Last login</span><strong>{customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleDateString() : 'Never'}</strong></div>
          <div className={s.summaryLine}><span>Reviews</span><strong>{customer._count?.reviews || 0}</strong></div>
        </Card>
      </aside>
    </div>
  </div>

  function Card({ title, sub, children, action, icon }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
    return <section className={s.card}>
      <div className={s.cardHead}>
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {action}
        {icon && <span className={s.cardHeadIcon}>{icon}</span>}
      </div>
      <div className={s.cardBody}>{children}</div>
    </section>
  }
}
