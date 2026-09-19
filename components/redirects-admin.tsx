'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Route, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'

type RedirectRow = { id: string; fromPath: string; toPath: string; hits: number; createdAt: string }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { fromPath: '', toPath: '' }

export default function RedirectsAdmin({ initial }: { initial: RedirectRow[] }) {
  const [rows, setRows] = useState<RedirectRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editRow, setEditRow] = useState<RedirectRow | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(() => rows.filter(r => {
    const q = query.trim().toLowerCase()
    return !q || `${r.fromPath} ${r.toPath}`.toLowerCase().includes(q)
  }), [rows, query])

  async function refresh() {
    setError('')
    try { setRows(await api('/api/admin/redirects')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load redirects') }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api('/api/admin/redirects', { method: 'POST', body: JSON.stringify(form) })
      await refresh(); setForm(initialForm); setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create redirect') }
    finally { setSaving(false) }
  }

  async function remove(row: RedirectRow) {
    if (!window.confirm(`Delete the redirect from "${row.fromPath}"?`)) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/redirects', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete redirect') }
    finally { setBusy(null) }
  }

  function openEdit(row: RedirectRow) {
    setEditRow(row)
    setEditForm({ fromPath: row.fromPath, toPath: row.toPath })
    setError('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    setSaving(true); setError('')
    try {
      await api('/api/admin/redirects', { method: 'PATCH', body: JSON.stringify({ id: editRow.id, ...editForm }) })
      await refresh(); setEditRow(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update redirect') }
    finally { setSaving(false) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>URL redirects</h1><p className={ui.muted}>Send visitors from an old URL to a new one automatically, with a 308 permanent redirect.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className={ui.btn} onClick={() => setFormOpen(true)}><Plus size={16}/> Create redirect</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className="catalogStats">
      <div className="statCard"><span>Redirects</span><strong>{rows.length}</strong></div>
      <div className="statCard"><span>Total hits</span><strong>{rows.reduce((sum, r) => sum + r.hits, 0).toLocaleString()}</strong></div>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Route size={16}/><input placeholder="Search redirects…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="searchClear" onClick={() => setQuery('')}><X size={14}/></button>}</div>
      <span className={ui.muted}>{filtered.length} redirect{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><div className={ui.tableWrap}><table className={`${ui.table} productTable`} style={{ minWidth: 720 }}><thead><tr><th>From</th><th></th><th>To</th><th>Hits</th><th></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><code>{row.fromPath}</code></td>
        <td><ArrowRight size={14} className={ui.muted}/></td>
        <td><code>{row.toPath}</code></td>
        <td>{row.hits.toLocaleString()}</td>
        <td><div className="inline"><button className={ui.iconBtn} title="Edit redirect" onClick={() => openEdit(row)}><Pencil size={15}/></button><button className={ui.iconBtn} title="Delete redirect" disabled={busy === row.id} onClick={() => remove(row)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className={ui.empty}><Route size={28}/><h3>No redirects</h3><p className={ui.muted}>Create a redirect to send visitors from an old URL to a new one.</p></div>}
    </div>

    {formOpen && <div className={ui.modalOverlay} onClick={() => !saving && setFormOpen(false)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>CREATE REDIRECT</span><h2>New redirect</h2></div><button className={ui.iconBtn} onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={create}>
        <label className={ui.fieldLabel}>From path<input className={ui.input} required value={form.fromPath} onChange={e => setForm({ ...form, fromPath: e.target.value })} placeholder="/old-page"/><small className={ui.muted}>The path visitors currently land on, starting with /.</small></label>
        <label className={ui.fieldLabel}>To<input className={ui.input} required value={form.toPath} onChange={e => setForm({ ...form, toPath: e.target.value })} placeholder="/new-page or https://example.com"/><small className={ui.muted}>A path on this store, or a full URL to redirect elsewhere.</small></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create redirect'}</button></div>
      </form>
    </div></div>}

    {editRow && <div className={ui.modalOverlay} onClick={() => !saving && setEditRow(null)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>EDIT REDIRECT</span><h2>{editRow.fromPath}</h2></div><button className={ui.iconBtn} onClick={() => setEditRow(null)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={saveEdit}>
        <label className={ui.fieldLabel}>From path<input className={ui.input} required value={editForm.fromPath} onChange={e => setEditForm({ ...editForm, fromPath: e.target.value })}/></label>
        <label className={ui.fieldLabel}>To<input className={ui.input} required value={editForm.toPath} onChange={e => setEditForm({ ...editForm, toPath: e.target.value })}/></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditRow(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </div></div>}
  </div>
}
