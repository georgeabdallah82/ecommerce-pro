'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Globe2, Plus, RefreshCw, Trash2, Truck, X } from 'lucide-react'
import { money } from '@/lib/config'

type Rate = { id: string; name: string; price: number; freeAbove: number | null; estimatedDays: number | null; isActive: boolean }
type Zone = { id: string; name: string; countries: string; regions: string | null; isActive: boolean; rates: Rate[] }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { name: '', countries: 'Lebanon', regions: '', rateName: 'Standard', price: '0', freeAbove: '', estimatedDays: '2', isActive: true }

export default function ShippingAdminPro({ initial }: { initial: Zone[] }) {
  const [rows, setRows] = useState<Zone[]>(initial || [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [open, setOpen] = useState<string | null>(rows[0]?.id || null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(() => rows.filter(z => {
    const q = query.trim().toLowerCase()
    const qMatch = !q || `${z.name} ${z.countries} ${z.regions || ''}`.toLowerCase().includes(q)
    const sMatch = status === 'ALL' || (status === 'ACTIVE' ? z.isActive : !z.isActive)
    return qMatch && sMatch
  }), [rows, query, status])

  async function refresh() {
    setError('')
    try { const next = await api('/api/admin/shipping'); setRows(next); if (!open && next[0]) setOpen(next[0].id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load shipping settings') }
  }

  async function createZone(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const value = await api('/api/admin/shipping', { method: 'POST', body: JSON.stringify({
        name: form.name, countries: form.countries, regions: form.regions || null, rateName: form.rateName,
        price: Number(form.price) * 100, freeAbove: form.freeAbove === '' ? null : Number(form.freeAbove) * 100,
        estimatedDays: form.estimatedDays === '' ? null : Number(form.estimatedDays), isActive: form.isActive,
      }) })
      await refresh(); setOpen(value.zone.id); setForm(initialForm); setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create shipping zone') }
    finally { setSaving(false) }
  }

  async function toggleZone(zone: Zone) {
    setBusy(zone.id); setError('')
    try { await api('/api/admin/shipping', { method: 'PATCH', body: JSON.stringify({ id: zone.id, isActive: !zone.isActive }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update zone') }
    finally { setBusy(null) }
  }

  async function deleteZone(zone: Zone) {
    if (!window.confirm(`Delete ${zone.name}? This removes its shipping rates too.`)) return
    setBusy(zone.id); setError('')
    try { await api('/api/admin/shipping', { method: 'DELETE', body: JSON.stringify({ id: zone.id }) }); if (open === zone.id) setOpen(null); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete zone') }
    finally { setBusy(null) }
  }

  async function toggleRate(zone: Zone, rate: Rate) {
    setBusy(rate.id); setError('')
    try { await api('/api/admin/shipping', { method: 'PATCH', body: JSON.stringify({ id: zone.id, rate: { id: rate.id, isActive: !rate.isActive } }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update rate') }
    finally { setBusy(null) }
  }

  return <div className="catalogPage">
    <div className="sectionHead catalogHead"><div><span className="muted">SETTINGS</span><h1 className="h2">Shipping</h1><p className="muted">Control where you ship, which rates customers see, and free-shipping thresholds.</p></div><div className="inline"><button className="btn secondary" onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className="btn" onClick={() => setFormOpen(true)}><Plus size={16}/> Add zone</button></div></div>
    {error && <div className="alert danger">{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Shipping zones</span><strong>{rows.length}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active zones</span><strong>{rows.filter(x => x.isActive).length}</strong></button>
      <button className="statCard" onClick={() => setStatus('ALL')}><span>Rates</span><strong>{rows.reduce((n, z) => n + z.rates.length, 0)}</strong></button>
      <button className="statCard" onClick={() => setStatus('ACTIVE')}><span>Active rates</span><strong>{rows.reduce((n, z) => n + z.rates.filter(r => r.isActive).length, 0)}</strong></button>
    </div>

    <div className="card catalogToolbar">
      <div className="productSearch"><Globe2 size={16}/><input placeholder="Search zones, countries or regions…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="searchClear" onClick={() => setQuery('')}><X size={14}/></button>}</div>
      <select className="input" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ALL">All zones</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      <span className="muted">{filtered.length} zone{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className="card productTableCard"><div className="tableWrap"><table className="table productTable" style={{ minWidth: 980 }}><thead><tr><th>Zone</th><th>Coverage</th><th>Rates</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map(zone => <tr key={zone.id}>
        <td><button className="textButton" onClick={() => setOpen(open === zone.id ? null : zone.id)}><strong>{zone.name}</strong></button></td>
        <td><div><strong>{zone.countries || 'All countries'}</strong>{zone.regions && <div className="muted">{zone.regions}</div>}</div></td>
        <td><strong>{zone.rates.length}</strong><div className="muted">{zone.rates.filter(r => r.isActive).length} active</div></td>
        <td><span className={`statusPill ${zone.isActive ? 'success' : 'warning'}`}>{zone.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
        <td><div className="inline"><button className="textButton" disabled={busy === zone.id} onClick={() => toggleZone(zone)}>{zone.isActive ? 'Disable' : 'Enable'}</button><button className="iconBtn" title="Delete zone" disabled={busy === zone.id} onClick={() => deleteZone(zone)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className="empty"><Truck size={28}/><h3>No shipping zones</h3><p className="muted">Create a zone to define where and how you ship.</p></div>}
    </div>

    {filtered.filter(z => z.id === open).map(zone => <div className="card opsPanel" key={zone.id} style={{ marginTop: 14 }}>
      <div className="sectionHead" style={{ marginBottom: 14 }}><div><span className="muted">ZONE DETAILS</span><h2 className="h3">{zone.name}</h2><p className="muted">{zone.countries}{zone.regions ? ` · ${zone.regions}` : ''}</p></div><span className="pill">{zone.rates.length} rates</span></div>
      <div className="opsList">{zone.rates.map(rate => <div className="opsRow" key={rate.id}><div><strong>{rate.name}</strong><div className="muted">{rate.estimatedDays ? `${rate.estimatedDays} day estimate` : 'No delivery estimate'}{rate.freeAbove ? ` · Free over ${money(rate.freeAbove)}` : ''}</div></div><div className="inline"><strong>{money(rate.price)}</strong><span className={`statusPill ${rate.isActive ? 'success' : 'warning'}`}>{rate.isActive ? 'Active' : 'Inactive'}</span><button className="textButton" disabled={busy === rate.id} onClick={() => toggleRate(zone, rate)}>{rate.isActive ? 'Disable' : 'Enable'}</button></div></div>)}{!zone.rates.length && <div className="empty">No rates configured.</div>}</div>
    </div>)}

    {formOpen && <div className="modalOverlay" onClick={() => !saving && setFormOpen(false)}><div className="card discountsModal" onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className="muted tiny">CREATE SHIPPING ZONE</span><h2>New zone</h2><p className="muted">Define coverage and your first customer-facing rate.</p></div><button className="iconBtn" onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={createZone}><label className="fieldLabel">Zone name<input className="input" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Lebanon"/></label><label className="fieldLabel">Countries<input className="input" required value={form.countries} onChange={e => setForm({...form, countries: e.target.value})} placeholder="Lebanon"/><small className="muted">Use a comma-separated list for multiple countries.</small></label><label className="fieldLabel">Regions (optional)<input className="input" value={form.regions} onChange={e => setForm({...form, regions: e.target.value})} placeholder="Beirut, Metn"/></label><div className="discountFormGrid"><label className="fieldLabel">Rate name<input className="input" required value={form.rateName} onChange={e => setForm({...form, rateName: e.target.value})}/></label><label className="fieldLabel">Price<input className="input" type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})}/></label><label className="fieldLabel">Free over<input className="input" type="number" min="0" step="0.01" value={form.freeAbove} onChange={e => setForm({...form, freeAbove: e.target.value})} placeholder="None"/></label><label className="fieldLabel">Est. days<input className="input" type="number" min="0" step="1" value={form.estimatedDays} onChange={e => setForm({...form, estimatedDays: e.target.value})}/></label></div><label className="toggleRow"><input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})}/><span><strong>Zone is active</strong><small>Customers can use this zone immediately.</small></span></label><div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className="btn secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className="btn" disabled={saving}>{saving ? 'Creating…' : 'Create zone'}</button></div></form>
    </div></div>}
  </div>
}
