'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, Gift, Percent, Plus, Search, ShieldCheck, Tag, X } from 'lucide-react'
import { money } from '@/lib/config'

type Coupon = {
  id: string
  code: string
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  value: number
  minSubtotal: number | null
  maxUses: number | null
  usedCount: number
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  firstOrderOnly: boolean
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

function label(type: Coupon['type']) {
  return type === 'PERCENTAGE' ? 'Percentage' : type === 'FIXED' ? 'Fixed amount' : 'Free shipping'
}

function valueLabel(c: Coupon) {
  if (c.type === 'PERCENTAGE') return `${c.value}%`
  if (c.type === 'FIXED') return money(c.value)
  return 'Free shipping'
}

export default function CouponsAdminPro({ initial }: { initial: Coupon[] }) {
  const [rows, setRows] = useState<Coupon[]>(initial || [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ code: '', type: 'PERCENTAGE', value: '10', minSubtotal: '', maxUses: '', startsAt: '', expiresAt: '', firstOrderOnly: false })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(c => {
      const matchesQuery = !q || `${c.code} ${label(c.type)}`.toLowerCase().includes(q)
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? c.isActive : !c.isActive)
      return matchesQuery && matchesStatus
    })
  }, [rows, query, status])

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(x => x.isActive).length,
    used: rows.reduce((s, x) => s + x.usedCount, 0),
    expiring: rows.filter(x => x.expiresAt && new Date(x.expiresAt).getTime() < Date.now() + 7 * 86400000).length,
  }), [rows])

  async function refresh() {
    setRows(await api('/api/admin/coupons'))
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const type = form.type as Coupon['type']
      const valueNumber = Number(form.value)
      if (type === 'PERCENTAGE' && (valueNumber <= 0 || valueNumber > 100)) throw new Error('Percentage must be between 1 and 100.')
      if (type !== 'FREE_SHIPPING' && valueNumber < 0) throw new Error('Discount value cannot be negative.')
      await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify({
        code: form.code,
        type,
        value: type === 'PERCENTAGE' ? valueNumber : type === 'FIXED' ? Math.round(valueNumber * 100) : 0,
        minSubtotal: form.minSubtotal ? Math.round(Number(form.minSubtotal) * 100) : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        firstOrderOnly: form.firstOrderOnly,
      }) })
      await refresh()
      setForm({ code: '', type: 'PERCENTAGE', value: '10', minSubtotal: '', maxUses: '', startsAt: '', expiresAt: '', firstOrderOnly: false })
      setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create discount') }
    finally { setSaving(false) }
  }

  async function toggle(c: Coupon) {
    setError('')
    try { await api('/api/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, isActive: !c.isActive }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update discount') }
  }

  async function copyCode(code: string) {
    await navigator.clipboard?.writeText(code)
    setCopied(code)
    window.setTimeout(() => setCopied(''), 1300)
  }

  return <div className="catalogPage discountsPage">
    <div className="sectionHead catalogHead">
      <div><span className="muted">GROWTH</span><h1 className="h2">Discounts</h1><p className="muted">Create and manage discount codes with clear rules and usage control.</p></div>
      <button className="btn" onClick={() => setFormOpen(true)}><Plus size={16}/> Create discount</button>
    </div>

    {error && <div className="alert danger">{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Total discounts</span><strong>{stats.total}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active</span><strong>{stats.active}</strong></button>
      <button className="statCard" onClick={() => setQuery('')}><span>Redemptions</span><strong>{stats.used}</strong></button>
      <button className="statCard" onClick={() => setStatus('ACTIVE')}><span>Ending soon</span><strong>{stats.expiring}</strong></button>
    </div>

    <div className="card catalogToolbar">
      <div className="productSearch"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search discount codes…"/><button className="searchClear" hidden={!query} onClick={() => setQuery('')}><X size={14}/></button></div>
      <select className="input" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ALL">All discounts</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      <button className="btn secondary" onClick={refresh}>Refresh</button>
    </div>

    <div className="card productTableCard">
      <div className="tableTopline"><span className="muted">{filtered.length} discount{filtered.length === 1 ? '' : 's'}</span><span className="muted">Codes are case-insensitive</span></div>
      <div className="tableWrap"><table className="table productTable"><thead><tr><th>Discount</th><th>Type</th><th>Value</th><th>Usage</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody>
        {filtered.map(c => <tr key={c.id}>
          <td><div className="inline"><div className="productThumb"><Tag size={18}/></div><div><strong>{c.code}</strong><div className="muted">{c.firstOrderOnly ? 'First order only' : 'Available to all customers'}</div></div></div></td>
          <td>{label(c.type)}</td><td><strong>{valueLabel(c)}</strong>{c.minSubtotal ? <div className="muted">Min {money(c.minSubtotal)}</div> : null}</td>
          <td>{c.usedCount}{c.maxUses ? <span className="muted"> / {c.maxUses}</span> : <span className="muted"> / unlimited</span>}</td>
          <td>{c.expiresAt ? <span>{new Date(c.expiresAt).toLocaleDateString()}</span> : <span className="muted">No expiry</span>}</td>
          <td><span className={`statusPill ${c.isActive ? 'success' : 'warning'}`}>{c.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
          <td><div className="inline"><button className="iconBtn" title="Copy code" onClick={() => copyCode(c.code)}>{copied === c.code ? <Check size={15}/> : <Copy size={15}/>}</button><button className="textButton" onClick={() => toggle(c)}>{c.isActive ? 'Disable' : 'Enable'}</button></div></td>
        </tr>)}
      </tbody></table></div>
      {!filtered.length && <div className="empty"><Gift size={28}/><h3>No discounts found</h3><p className="muted">Try a different search or create a new discount.</p></div>}
    </div>

    {formOpen && <div className="modalOverlay" onClick={() => !saving && setFormOpen(false)}><div className="card discountsModal" onClick={e => e.stopPropagation()}>
      <div className="inventoryModalHead"><div><span className="muted tiny">CREATE DISCOUNT</span><h2>New discount</h2><p className="muted">Set the code, value and eligibility rules.</p></div><button className="iconBtn" onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form onSubmit={createCoupon} className="discountForm">
        <div className="discountCodeRow"><label className="fieldLabel">Discount code<input className="input" required value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase().replace(/\s+/g, '-').slice(0, 64)})} placeholder="SUMMER10"/></label><button type="button" className="btn secondary" onClick={() => setForm({...form, code: `SAVE${Math.floor(1000 + Math.random()*9000)}`})}>Generate</button></div>
        <div className="discountTypeGrid"><button type="button" className={`discountType ${form.type === 'PERCENTAGE' ? 'active' : ''}`} onClick={() => setForm({...form, type: 'PERCENTAGE'})}><Percent size={17}/><strong>Percentage</strong><span>10% off</span></button><button type="button" className={`discountType ${form.type === 'FIXED' ? 'active' : ''}`} onClick={() => setForm({...form, type: 'FIXED'})}><Tag size={17}/><strong>Fixed amount</strong><span>$10 off</span></button><button type="button" className={`discountType ${form.type === 'FREE_SHIPPING' ? 'active' : ''}`} onClick={() => setForm({...form, type: 'FREE_SHIPPING', value: '0'})}><Gift size={17}/><strong>Free shipping</strong><span>Remove shipping charge</span></button></div>
        {form.type !== 'FREE_SHIPPING' && <label className="fieldLabel">Value<input className="input" required type="number" min="0" step="0.01" max={form.type === 'PERCENTAGE' ? 100 : undefined} value={form.value} onChange={e => setForm({...form, value: e.target.value})}/></label>}
        <div className="discountFormGrid"><label className="fieldLabel">Minimum order<input className="input" type="number" min="0" step="0.01" value={form.minSubtotal} onChange={e => setForm({...form, minSubtotal: e.target.value})} placeholder="None"/></label><label className="fieldLabel">Maximum uses<input className="input" type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm({...form, maxUses: e.target.value})} placeholder="Unlimited"/></label><label className="fieldLabel">Starts<input className="input" type="datetime-local" value={form.startsAt} onChange={e => setForm({...form, startsAt: e.target.value})}/></label><label className="fieldLabel">Ends<input className="input" type="datetime-local" value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})}/></label></div>
        <label className="toggleRow"><input type="checkbox" checked={form.firstOrderOnly} onChange={e => setForm({...form, firstOrderOnly: e.target.checked})}/><span><strong>First order only</strong><small>Limit this discount to customers with no previous completed order.</small></span></label>
        <div className="inline" style={{justifyContent:'space-between',marginTop:8}}><div className="inline"><ShieldCheck size={15}/><span className="muted">Validated again at checkout</span></div><div className="inline"><button type="button" className="btn secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className="btn" disabled={saving}>{saving ? 'Creating…' : 'Create discount'}</button></div></div>
      </form>
    </div></div>}
  </div>
}
