'use client'

import { useMemo, useState } from 'react'
import { Check, Globe2, Pencil, Plus, RefreshCw, Trash2, Truck, X } from 'lucide-react'
import { money } from '@/lib/config'
import ui from './admin-ui.module.css'

type Rate = { id: string; name: string; price: number; freeAbove: number | null; estimatedDays: number | null; isActive: boolean }
type Zone = { id: string; name: string; countries: string; regions: string | null; isActive: boolean; rates: Rate[] }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { name: '', countries: 'Lebanon', regions: '', rateName: 'Standard', price: '0', freeAbove: '', estimatedDays: '2', isActive: true }
const initialRateForm = { name: '', price: '0', freeAbove: '', estimatedDays: '2' }

function dollars(cents: number | null) {
  return cents === null ? '' : String(cents / 100)
}

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

  const [editZone, setEditZone] = useState<Zone | null>(null)
  const [editZoneForm, setEditZoneForm] = useState({ name: '', countries: '', regions: '' })

  const [addRateFor, setAddRateFor] = useState<string | null>(null)
  const [rateForm, setRateForm] = useState(initialRateForm)

  const [editingRate, setEditingRate] = useState<string | null>(null)
  const [editRateForm, setEditRateForm] = useState(initialRateForm)

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

  function openEditZone(zone: Zone) {
    setEditZone(zone)
    setEditZoneForm({ name: zone.name, countries: zone.countries, regions: zone.regions || '' })
    setError('')
  }

  async function saveEditZone(e: React.FormEvent) {
    e.preventDefault()
    if (!editZone) return
    setSaving(true); setError('')
    try {
      await api('/api/admin/shipping', { method: 'PATCH', body: JSON.stringify({
        id: editZone.id, name: editZoneForm.name, countries: editZoneForm.countries, regions: editZoneForm.regions || null,
      }) })
      await refresh(); setEditZone(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update zone details') }
    finally { setSaving(false) }
  }

  function openAddRate(zoneId: string) {
    setAddRateFor(zoneId)
    setRateForm(initialRateForm)
    setError('')
  }

  async function submitAddRate(e: React.FormEvent, zone: Zone) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api('/api/admin/shipping', { method: 'PATCH', body: JSON.stringify({
        id: zone.id, addRates: [{
          name: rateForm.name || 'Standard',
          price: Number(rateForm.price) * 100,
          freeAbove: rateForm.freeAbove === '' ? null : Number(rateForm.freeAbove) * 100,
          estimatedDays: rateForm.estimatedDays === '' ? null : Number(rateForm.estimatedDays),
        }],
      }) })
      await refresh(); setAddRateFor(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add rate') }
    finally { setSaving(false) }
  }

  function startEditRate(rate: Rate) {
    setEditingRate(rate.id)
    setEditRateForm({ name: rate.name, price: dollars(rate.price), freeAbove: dollars(rate.freeAbove), estimatedDays: rate.estimatedDays === null ? '' : String(rate.estimatedDays) })
    setError('')
  }

  async function saveEditRate(e: React.FormEvent, zone: Zone, rateId: string) {
    e.preventDefault(); setBusy(rateId); setError('')
    try {
      await api('/api/admin/shipping', { method: 'PATCH', body: JSON.stringify({
        id: zone.id, rate: {
          id: rateId,
          name: editRateForm.name || 'Standard',
          price: Number(editRateForm.price) * 100,
          freeAbove: editRateForm.freeAbove === '' ? null : Number(editRateForm.freeAbove) * 100,
          estimatedDays: editRateForm.estimatedDays === '' ? null : Number(editRateForm.estimatedDays),
        },
      }) })
      await refresh(); setEditingRate(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update rate') }
    finally { setBusy(null) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>SETTINGS</span><h1 className={ui.title}>Shipping</h1><p className={ui.muted}>Control where you ship, which rates customers see, and free-shipping thresholds.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className={ui.btn} onClick={() => setFormOpen(true)}><Plus size={16}/> Add zone</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Shipping zones</span><strong>{rows.length}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active zones</span><strong>{rows.filter(x => x.isActive).length}</strong></button>
      <button className="statCard" onClick={() => setStatus('ALL')}><span>Rates</span><strong>{rows.reduce((n, z) => n + z.rates.length, 0)}</strong></button>
      <button className="statCard" onClick={() => setStatus('ACTIVE')}><span>Active rates</span><strong>{rows.reduce((n, z) => n + z.rates.filter(r => r.isActive).length, 0)}</strong></button>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Globe2 size={16}/><input placeholder="Search zones, countries or regions…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="searchClear" onClick={() => setQuery('')}><X size={14}/></button>}</div>
      <select className={ui.input} value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ALL">All zones</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      <span className={ui.muted}>{filtered.length} zone{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><div className={ui.tableWrap}><table className={`${ui.table} productTable`} style={{ minWidth: 980 }}><thead><tr><th>Zone</th><th>Coverage</th><th>Rates</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map(zone => <tr key={zone.id}>
        <td><button className={ui.textButton} onClick={() => setOpen(open === zone.id ? null : zone.id)}><strong>{zone.name}</strong></button></td>
        <td><div><strong>{zone.countries || 'All countries'}</strong>{zone.regions && <div className={ui.muted}>{zone.regions}</div>}</div></td>
        <td><strong>{zone.rates.length}</strong><div className={ui.muted}>{zone.rates.filter(r => r.isActive).length} active</div></td>
        <td><span className={`${ui.statusPill} ${zone.isActive ? ui.statusPillSuccess : ui.statusPillWarning}`}>{zone.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
        <td><div className="inline"><button className={ui.textButton} disabled={busy === zone.id} onClick={() => toggleZone(zone)}>{zone.isActive ? 'Disable' : 'Enable'}</button><button className={ui.iconBtn} title="Edit zone" onClick={() => openEditZone(zone)}><Pencil size={15}/></button><button className={ui.iconBtn} title="Delete zone" disabled={busy === zone.id} onClick={() => deleteZone(zone)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className={ui.empty}><Truck size={28}/><h3>No shipping zones</h3><p className={ui.muted}>Create a zone to define where and how you ship.</p></div>}
    </div>

    {filtered.filter(z => z.id === open).map(zone => <div className={`${ui.card} opsPanel`} key={zone.id} style={{ marginTop: 14 }}>
      <div className={ui.sectionHead} style={{ marginBottom: 14 }}><div><span className={ui.muted}>ZONE DETAILS</span><h2 className="h3">{zone.name}</h2><p className={ui.muted}>{zone.countries}{zone.regions ? ` · ${zone.regions}` : ''}</p></div><div className="inline"><span className={ui.pill}>{zone.rates.length} rates</span><button className={`${ui.btn} ${ui.btnSecondary}`} type="button" onClick={() => openAddRate(zone.id)}><Plus size={14}/> Add rate</button></div></div>
      <div className="opsList">{zone.rates.map(rate => editingRate === rate.id ? (
        <form className="opsRow" key={rate.id} onSubmit={e => saveEditRate(e, zone, rate.id)} style={{ gridTemplateColumns: '1fr', gap: 10 }}>
          <div className="discountFormGrid">
            <label className={ui.fieldLabel}>Rate name<input className={ui.input} required value={editRateForm.name} onChange={e => setEditRateForm({ ...editRateForm, name: e.target.value })}/></label>
            <label className={ui.fieldLabel}>Price<input className={ui.input} type="number" min="0" step="0.01" value={editRateForm.price} onChange={e => setEditRateForm({ ...editRateForm, price: e.target.value })}/></label>
            <label className={ui.fieldLabel}>Free over<input className={ui.input} type="number" min="0" step="0.01" value={editRateForm.freeAbove} onChange={e => setEditRateForm({ ...editRateForm, freeAbove: e.target.value })} placeholder="None"/></label>
            <label className={ui.fieldLabel}>Est. days<input className={ui.input} type="number" min="0" step="1" value={editRateForm.estimatedDays} onChange={e => setEditRateForm({ ...editRateForm, estimatedDays: e.target.value })}/></label>
          </div>
          <div className="inline" style={{ justifyContent: 'flex-end' }}><button type="button" className={ui.textButton} onClick={() => setEditingRate(null)} disabled={busy === rate.id}>Cancel</button><button className={ui.btn} disabled={busy === rate.id}>{busy === rate.id ? 'Saving…' : 'Save rate'}</button></div>
        </form>
      ) : (
        <div className="opsRow" key={rate.id}><div><strong>{rate.name}</strong><div className={ui.muted}>{rate.estimatedDays ? `${rate.estimatedDays} day estimate` : 'No delivery estimate'}{rate.freeAbove ? ` · Free over ${money(rate.freeAbove)}` : ''}</div></div><div className="inline"><strong>{money(rate.price)}</strong><span className={`${ui.statusPill} ${rate.isActive ? ui.statusPillSuccess : ui.statusPillWarning}`}>{rate.isActive ? 'Active' : 'Inactive'}</span><button className={ui.iconBtn} title="Edit rate" disabled={busy === rate.id} onClick={() => startEditRate(rate)}><Pencil size={14}/></button><button className={ui.textButton} disabled={busy === rate.id} onClick={() => toggleRate(zone, rate)}>{rate.isActive ? 'Disable' : 'Enable'}</button></div></div>
      ))}{!zone.rates.length && <div className={ui.empty}>No rates configured.</div>}</div>
      {addRateFor === zone.id && <form className={`${ui.card} discountForm`} style={{ marginTop: 14, padding: 16 }} onSubmit={e => submitAddRate(e, zone)}>
        <div className="discountFormGrid">
          <label className={ui.fieldLabel}>Rate name<input className={ui.input} required value={rateForm.name} onChange={e => setRateForm({ ...rateForm, name: e.target.value })} placeholder="Express"/></label>
          <label className={ui.fieldLabel}>Price<input className={ui.input} type="number" min="0" step="0.01" value={rateForm.price} onChange={e => setRateForm({ ...rateForm, price: e.target.value })}/></label>
          <label className={ui.fieldLabel}>Free over<input className={ui.input} type="number" min="0" step="0.01" value={rateForm.freeAbove} onChange={e => setRateForm({ ...rateForm, freeAbove: e.target.value })} placeholder="None"/></label>
          <label className={ui.fieldLabel}>Est. days<input className={ui.input} type="number" min="0" step="1" value={rateForm.estimatedDays} onChange={e => setRateForm({ ...rateForm, estimatedDays: e.target.value })}/></label>
        </div>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAddRateFor(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Adding…' : 'Add rate'}</button></div>
      </form>}
    </div>)}

    {formOpen && <div className={ui.modalOverlay} onClick={() => !saving && setFormOpen(false)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>CREATE SHIPPING ZONE</span><h2>New zone</h2><p className={ui.muted}>Define coverage and your first customer-facing rate.</p></div><button className={ui.iconBtn} onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={createZone}><label className={ui.fieldLabel}>Zone name<input className={ui.input} required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Lebanon"/></label><label className={ui.fieldLabel}>Countries<input className={ui.input} required value={form.countries} onChange={e => setForm({...form, countries: e.target.value})} placeholder="Lebanon"/><small className={ui.muted}>Use a comma-separated list for multiple countries.</small></label><label className={ui.fieldLabel}>Regions (optional)<input className={ui.input} value={form.regions} onChange={e => setForm({...form, regions: e.target.value})} placeholder="Beirut, Metn"/></label><div className="discountFormGrid"><label className={ui.fieldLabel}>Rate name<input className={ui.input} required value={form.rateName} onChange={e => setForm({...form, rateName: e.target.value})}/></label><label className={ui.fieldLabel}>Price<input className={ui.input} type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})}/></label><label className={ui.fieldLabel}>Free over<input className={ui.input} type="number" min="0" step="0.01" value={form.freeAbove} onChange={e => setForm({...form, freeAbove: e.target.value})} placeholder="None"/></label><label className={ui.fieldLabel}>Est. days<input className={ui.input} type="number" min="0" step="1" value={form.estimatedDays} onChange={e => setForm({...form, estimatedDays: e.target.value})}/></label></div><label className="toggleRow"><input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})}/><span><strong>Zone is active</strong><small>Customers can use this zone immediately.</small></span></label><div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create zone'}</button></div></form>
    </div></div>}

    {editZone && <div className={ui.modalOverlay} onClick={() => !saving && setEditZone(null)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>EDIT SHIPPING ZONE</span><h2>{editZone.name}</h2><p className={ui.muted}>Update coverage details for this zone.</p></div><button className={ui.iconBtn} onClick={() => setEditZone(null)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={saveEditZone}>
        <label className={ui.fieldLabel}>Zone name<input className={ui.input} required value={editZoneForm.name} onChange={e => setEditZoneForm({ ...editZoneForm, name: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Countries<input className={ui.input} required value={editZoneForm.countries} onChange={e => setEditZoneForm({ ...editZoneForm, countries: e.target.value })}/><small className={ui.muted}>Use a comma-separated list for multiple countries.</small></label>
        <label className={ui.fieldLabel}>Regions (optional)<input className={ui.input} value={editZoneForm.regions} onChange={e => setEditZoneForm({ ...editZoneForm, regions: e.target.value })}/></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditZone(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </div></div>}
  </div>
}
