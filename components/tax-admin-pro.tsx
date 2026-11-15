'use client'

import { useMemo, useState } from 'react'
import { Check, Globe2, Pencil, Percent, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-content-editors.module.css'
import { CountryMultiSelect } from './field-selects'
import { useConfirm } from './admin-confirm'
import AdminFormDialog, { DialogError } from './admin-form-dialog'
import AdminScrollArea from './admin-scroll-area'
import { fetchRead } from '@/lib/retry-fetch'

type TaxRateRow = { id: string; name: string; countries: string; rate: number; isActive: boolean }

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { name: '', countries: '', rate: '0', isActive: true }

export default function TaxAdminPro({ initial }: { initial: TaxRateRow[] }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<TaxRateRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editRow, setEditRow] = useState<TaxRateRow | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [error, setError] = useState('')
  // Why a save in the New / Edit tax rate dialog failed, shown in the dialog (it was shown on the page behind the
  // overlay; docs/admin-settings-2026-11.md).
  const [dialogError, setDialogError] = useState('')
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
    e.preventDefault(); setSaving(true); setDialogError('')
    try {
      await api('/api/admin/tax-rates', { method: 'POST', body: JSON.stringify({ name: form.name, countries: form.countries || '*', rate: Number(form.rate), isActive: form.isActive }) })
      await refresh(); setForm(initialForm); setFormOpen(false)
    } catch (e) { setDialogError(e instanceof Error ? e.message : 'Unable to create tax rate') }
    finally { setSaving(false) }
  }

  async function toggleRate(row: TaxRateRow) {
    if (row.isActive && !(await confirm({ title: `Disable "${row.name}"?`, message: 'Checkout stops charging this tax rate until you enable it again.', confirmLabel: 'Disable tax rate' }))) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/tax-rates', { method: 'PATCH', body: JSON.stringify({ id: row.id, isActive: !row.isActive }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update tax rate') }
    finally { setBusy(null) }
  }

  async function deleteRate(row: TaxRateRow) {
    if (!(await confirm({ title: `Delete "${row.name}"?`, message: 'Checkout stops charging this tax rate.', confirmLabel: 'Delete tax rate' }))) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/tax-rates', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete tax rate') }
    finally { setBusy(null) }
  }

  function openEdit(row: TaxRateRow) {
    setEditRow(row)
    setEditForm({ name: row.name, countries: row.countries, rate: String(row.rate), isActive: row.isActive })
    setDialogError('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    setSaving(true); setDialogError('')
    try {
      await api('/api/admin/tax-rates', { method: 'PATCH', body: JSON.stringify({ id: editRow.id, name: editForm.name, countries: editForm.countries || '*', rate: Number(editForm.rate), isActive: editForm.isActive }) })
      await refresh(); setEditRow(null)
    } catch (e) { setDialogError(e instanceof Error ? e.message : 'Unable to update tax rate') }
    finally { setSaving(false) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>SETTINGS</span><h1 className={ui.title}>Tax</h1><p className={ui.muted}>Charge different tax rates by destination country. The Settings page's default rate applies when no zone below matches.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className={ui.btn} onClick={() => { setDialogError(''); setFormOpen(true) }}><Plus size={16}/> Add tax rate</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Tax rates</span><strong>{rows.length}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active rates</span><strong>{rows.filter(x => x.isActive).length}</strong></button>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Globe2 size={16}/><input placeholder="Search tax rates or countries…" aria-label="Search tax rates" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" className="searchClear" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} aria-hidden="true"/></button>}</div>
      <select className={ui.input} aria-label="Show tax rates" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="ALL">All rates</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      <span className={ui.muted}>{filtered.length} rate{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><AdminScrollArea label="Tax rates"><table className={`${ui.table} productTable`} style={{ minWidth: 760 }}><thead><tr><th>Name</th><th>Countries</th><th>Rate</th><th>Status</th><th><span className={s.srOnly}>Actions</span></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><strong>{row.name}</strong></td>
        <td>{row.countries === '*' ? 'All countries (fallback)' : row.countries}</td>
        <td><strong>{row.rate}%</strong></td>
        <td><span className={`${ui.statusPill} ${row.isActive ? ui.statusPillSuccess : ui.statusPillWarning}`}>{row.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
        <td><div className="inline"><button className={row.isActive ? `${ui.textButton} ${ui.textButtonDanger}` : ui.textButton} disabled={busy === row.id} onClick={() => toggleRate(row)}>{row.isActive ? 'Disable' : 'Enable'}</button><button className={ui.iconBtn} title={`Edit ${row.name}`} aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}><Pencil size={15}/></button><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title={`Delete ${row.name}`} aria-label={`Delete ${row.name}`} disabled={busy === row.id} onClick={() => deleteRate(row)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></AdminScrollArea>
    {!filtered.length && <div className={ui.empty}><Percent size={28}/><h2>No tax rates</h2><p className={ui.muted}>Add a tax rate to charge different rates by destination country.</p></div>}
    </div>

    <AdminFormDialog open={formOpen} eyebrow="CREATE TAX RATE" title="New tax rate" description="Define which countries this rate applies to." busy={saving} onClose={() => setFormOpen(false)}>
      <form className="discountForm" onSubmit={createRate}>
        <label className={ui.fieldLabel}>Name<input className={ui.input} required data-autofocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="EU VAT"/></label>
        <label className={ui.fieldLabel}>Countries<CountryMultiSelect className={ui.select} value={form.countries} onChange={v => setForm({ ...form, countries: v })} aria-label="Countries" /><small className={ui.muted}>Choose one or more countries. Leave it empty or choose All countries (fallback) to apply this rate to every country without a more specific match.</small></label>
        <label className={ui.fieldLabel}>Rate (%)<input className={ui.input} type="number" min="0" max="100" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })}/></label>
        <label className="toggleRow"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })}/><span><strong>Rate is active</strong><small>Applies to checkout immediately.</small></span></label>
        <DialogError error={dialogError}/>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create tax rate'}</button></div>
      </form>
    </AdminFormDialog>

    <AdminFormDialog open={!!editRow} eyebrow="EDIT TAX RATE" title={editRow?.name || ''} description="Update coverage and rate." busy={saving} onClose={() => setEditRow(null)}>
      <form className="discountForm" onSubmit={saveEdit}>
        <label className={ui.fieldLabel}>Name<input className={ui.input} required data-autofocus value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Countries<CountryMultiSelect className={ui.select} value={editForm.countries} onChange={v => setEditForm({ ...editForm, countries: v })} aria-label="Countries" /><small className={ui.muted}>Choose one or more countries, or All countries (fallback) for every country without a more specific rate.</small></label>
        <label className={ui.fieldLabel}>Rate (%)<input className={ui.input} type="number" min="0" max="100" step="0.01" value={editForm.rate} onChange={e => setEditForm({ ...editForm, rate: e.target.value })}/></label>
        <DialogError error={dialogError}/>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditRow(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </AdminFormDialog>
  </div>
}
