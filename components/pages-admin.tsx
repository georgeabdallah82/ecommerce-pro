'use client'

import { useMemo, useState } from 'react'
import { Check, ExternalLink, FileText, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'

type PageRow = { id: string; title: string; handle: string; bodyHtml: string | null; status: string; seoTitle: string | null; seoDescription: string | null; updatedAt: string }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { title: '', handle: '', bodyHtml: '', status: 'DRAFT', seoTitle: '', seoDescription: '' }

export default function PagesAdmin({ initial }: { initial: PageRow[] }) {
  const [rows, setRows] = useState<PageRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editRow, setEditRow] = useState<PageRow | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(() => rows.filter(r => {
    const q = query.trim().toLowerCase()
    return !q || `${r.title} ${r.handle}`.toLowerCase().includes(q)
  }), [rows, query])

  async function refresh() {
    setError('')
    try { setRows(await api('/api/admin/pages')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load pages') }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api('/api/admin/pages', { method: 'POST', body: JSON.stringify(form) })
      await refresh(); setForm(initialForm); setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create page') }
    finally { setSaving(false) }
  }

  async function remove(row: PageRow) {
    if (!window.confirm(`Delete "${row.title}"?`)) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/pages', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete page') }
    finally { setBusy(null) }
  }

  function openEdit(row: PageRow) {
    setEditRow(row)
    setEditForm({ title: row.title, handle: row.handle, bodyHtml: row.bodyHtml || '', status: row.status, seoTitle: row.seoTitle || '', seoDescription: row.seoDescription || '' })
    setError('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    setSaving(true); setError('')
    try {
      await api('/api/admin/pages', { method: 'PATCH', body: JSON.stringify({ id: editRow.id, ...editForm }) })
      await refresh(); setEditRow(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update page') }
    finally { setSaving(false) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>Pages</h1><p className={ui.muted}>Standalone pages like About Us or FAQ, reachable at yourstore.com/handle.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className={ui.btn} onClick={() => setFormOpen(true)}><Plus size={16}/> Add page</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><FileText size={16}/><input placeholder="Search pages…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="searchClear" onClick={() => setQuery('')}><X size={14}/></button>}</div>
      <span className={ui.muted}>{filtered.length} page{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><div className={ui.tableWrap}><table className={`${ui.table} productTable`} style={{ minWidth: 720 }}><thead><tr><th>Title</th><th>Handle</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><strong>{row.title}</strong></td>
        <td><code>/{row.handle}</code></td>
        <td><span className={`${ui.statusPill} ${row.status === 'PUBLISHED' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{row.status === 'PUBLISHED' ? <><Check size={13}/> Published</> : 'Draft'}</span></td>
        <td><div className="inline">{row.status === 'PUBLISHED' && <a className={ui.iconBtn} title="View page" href={`/${row.handle}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a>}<button className={ui.iconBtn} title="Edit page" onClick={() => openEdit(row)}><Pencil size={15}/></button><button className={ui.iconBtn} title="Delete page" disabled={busy === row.id} onClick={() => remove(row)}><Trash2 size={15}/></button></div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <div className={ui.empty}><FileText size={28}/><h3>No pages</h3><p className={ui.muted}>Add a page like About Us, FAQ, or Contact.</p></div>}
    </div>

    {formOpen && <div className={ui.modalOverlay} onClick={() => !saving && setFormOpen(false)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>CREATE PAGE</span><h2>New page</h2></div><button className={ui.iconBtn} onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={create}>
        <label className={ui.fieldLabel}>Title<input className={ui.input} required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="About Us"/></label>
        <label className={ui.fieldLabel}>Handle <span className={ui.muted}>(optional)</span><input className={ui.input} value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} placeholder="Generated from title if left blank"/></label>
        <label className={ui.fieldLabel}>Content<textarea className={ui.textarea} rows={8} value={form.bodyHtml} onChange={e => setForm({ ...form, bodyHtml: e.target.value })} placeholder="<p>Page content, HTML allowed.</p>"/></label>
        <label className={ui.fieldLabel}>SEO title <span className={ui.muted}>(optional)</span><input className={ui.input} value={form.seoTitle} onChange={e => setForm({ ...form, seoTitle: e.target.value })}/></label>
        <label className={ui.fieldLabel}>SEO description <span className={ui.muted}>(optional)</span><input className={ui.input} value={form.seoDescription} onChange={e => setForm({ ...form, seoDescription: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Status<select className={ui.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create page'}</button></div>
      </form>
    </div></div>}

    {editRow && <div className={ui.modalOverlay} onClick={() => !saving && setEditRow(null)}><div className={`${ui.card} discountsModal`} onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>EDIT PAGE</span><h2>{editRow.title}</h2></div><button className={ui.iconBtn} onClick={() => setEditRow(null)} disabled={saving}><X size={17}/></button></div>
      <form className="discountForm" onSubmit={saveEdit}>
        <label className={ui.fieldLabel}>Title<input className={ui.input} required value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Handle<input className={ui.input} value={editForm.handle} onChange={e => setEditForm({ ...editForm, handle: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Content<textarea className={ui.textarea} rows={8} value={editForm.bodyHtml} onChange={e => setEditForm({ ...editForm, bodyHtml: e.target.value })}/></label>
        <label className={ui.fieldLabel}>SEO title<input className={ui.input} value={editForm.seoTitle} onChange={e => setEditForm({ ...editForm, seoTitle: e.target.value })}/></label>
        <label className={ui.fieldLabel}>SEO description<input className={ui.input} value={editForm.seoDescription} onChange={e => setEditForm({ ...editForm, seoDescription: e.target.value })}/></label>
        <label className={ui.fieldLabel}>Status<select className={ui.input} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditRow(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </div></div>}
  </div>
}
