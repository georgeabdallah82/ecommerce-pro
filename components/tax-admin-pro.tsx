'use client'

import { useMemo, useState } from 'react'
import { Check, Globe2, Pencil, Percent, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'

type TaxRateRow = { id: string; name: string; countries: string; rate: number; isActive: boolean }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { name: '', countries: '', rate: '0', isActive: true }

export default function TaxAdminPro({ initial }: { initial: TaxRateRow[] }) {
  const [rows, setRows] = useState<TaxRateRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editRow, setEditRow] = useState<TaxRateRow | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(() => rows.filter(r => {
    const q = query.trim().toLowerCase()
    const qMatch = !q || `${r.name} ${r.countries}`.toLowerCase().includes(q)
    const sMatch = status === 'ALL' || (status === 'ACTIVE' ? r.isActive : !r.isActive)
    return qMatch && sMatch
  }), [rows, query, status])

  async function refresh() {
    setError('')
    try { setRows(await api('/api/admin/tax-rates')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load tax rates') }
  }

  async function createRate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api('/api/admin/tax-rates', { method: 'POST', body: JSON.stringify({ name: form.name, countries: form.countries || '*', rate: Number(form.rate), isActive: form.isActive }) })
      await refresh(); setForm(initialForm); setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create tax rate') }
    finally { setSaving(false) }
  }

  async function toggleRate(row: TaxRateRow) {
    setBusy(row.id); setError('')
    try { await api('/api/admin/tax-rates', { method: 'PATCH', body: JSON.stringify({ id: row.id, isActive: !row.isActive }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update tax rate') }
    finally { setBusy(null) }
  }

  async function deleteRate(row: TaxRateRow) {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/tax-rates', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete tax rate') }
    finally { setBusy(null) }
  }

  function openEdit(row: TaxRateRow) {
    setEditRow(row)
    setEditForm({ name: row.name, countries: row.countries, rate: String(row.rate), isActive: row.isActive })
    setError('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    setSaving(true); setError('')
    try {
      await api('/api/admin/tax-rates', { method: 'PATCH', body: JSON.stringify({ id: editRow.id, name: editForm.name, countries: editForm.countries || '*', rate: Number(editForm.rate), isActive: editForm.isActive }) })
      await refresh(); setEditRow(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update tax rate') }
    finally { setSaving(false) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>SETTINGS</span><h1 className={ui.title}>Tax</h1><p className={ui.muted}>Charge different tax rates by destination country. The Settings page's default rate applies when no zone below matches.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className={ui.btn} onClick={() => setFormOpen(true)}><Plus size={16}/> Add tax rate</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Tax rates</span><strong>{rows.length}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active rates</span><strong>{rows.filter(x => x.isActive).length}</strong></button>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Globe2 size={16}/><input placeholder="Search tax rates or countries…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="searchClear" onClick={() => setQuery('')}><X size={14}/></button>}</div>
      <select className={ui.input} value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ALL">All rates</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      <span className={ui.muted}>{filtered.length} rate{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><div className={ui.tableWrap}><table className={`${ui.table} productTable`} style={{ minWidth: 760 }}><thead><tr><th>Name</th><th>Countries</th><th>Rate</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><strong>{row.name}</strong></td>
        <td>{row.countries === '*' ? 'All countries (fallback)' : row.countries}</td>
        <td><strong>{row.rate}%</strong></td>
        <td><span className={`${ui.statusPill} ${row.isActive ? ui.statusPillSuccess : ui.statusPillWarning}`}>{row.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
        <td><div className="inline"><button className={ui.textButton} disabled={busy === row.id} onClick={() => toggleRate(row)}>{row.isActive ? 'Disable' : 'Enable'}</button><button className={ui.iconBtn} title="Edit tax rate" onClick={() => openEdit(row)}><Pencil size={15}/></button><button className={ui.iconBtn} title="Delete tax rate" disabled={busy === row.id} onClick={() => deleteRate(row)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className={ui.empty}><Percent size={28}/><h3>No tax rates</h3><p className={ui.muted}>Add a tax rate to charge different rates by destination country.</p></div>}
    </div>

    {formOpen && <div className={ui.modalOverlay} onClick={() => !saving && setFormOpen(false)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>CREATE TAX RATE</span><h2>New tax rate</h2><p className={ui.muted}>Define which countries this rate applies to.</p></div><button className={ui.iconBtn} onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={createRate}>
        <label className={ui.fieldLabel}>Name<input className={ui.input} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="EU VAT"/></label>
        <label className={ui.fieldLabel}>Countries<input className={ui.input} value={form.countries} onChange={e => setForm({ ...form, countries: e.target.value })} placeholder="DE, FR, IT"/><small className={ui.muted}>Comma-separated ISO country codes, or leave blank / use * to act as the fallback rate for every country without a specific match.</small></label>
        <label className={ui.fieldLabel}>Rate (%)<input className={ui.input} type="number" min="0" max="100" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })}/></label>
        <label className="toggleRow"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })}/><span><strong>Rate is active</strong><small>Applies to checkout immediately.</small></span></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create tax rate'}</button></div>
      </form>
    </div></div>}

    {editRow && <div className={ui.modalOverlay} onClick={() => !saving && setEditRow(null)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>EDIT TAX RATE</span><h2>{editRow.name}</h2><p className={ui.muted}>Update coverage and rate.</p></div><button className={ui.iconBtn} onClick={() => setEditRow(null)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={saveEdit}>
        <label className={ui.fieldLabel}>Name<input className={ui.input} required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Countries<input className={ui.input} value={editForm.countries} onChange={e => setEditForm({ ...editForm, countries: e.target.value })}/><small className={ui.muted}>Comma-separated ISO country codes, or * for the fallback rate.</small></label>
        <label className={ui.fieldLabel}>Rate (%)<input className={ui.input} type="number" min="0" max="100" step="0.01" value={editForm.rate} onChange={e => setEditForm({ ...editForm, rate: e.target.value })}/></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditRow(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </div></div>}
  </div>
}
