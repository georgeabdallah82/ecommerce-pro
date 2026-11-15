'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Pencil, Plus, RefreshCw, Route, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-content-editors.module.css'
import { useConfirm } from './admin-confirm'
import AdminFormDialog, { DialogError } from './admin-form-dialog'
import AdminScrollArea from './admin-scroll-area'
import { fetchRead } from '@/lib/retry-fetch'

type RedirectRow = { id: string; fromPath: string; toPath: string; hits: number; createdAt: string }

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm = { fromPath: '', toPath: '' }

// Admin > Online store > URL redirects (docs/admin-online-store-pages-2026-11.md). What is refused (the store's own
// pages, circles) is decided by the API with lib/redirects.ts; the reason shows in the dialog.
export default function RedirectsAdmin({ initial, host }: { initial: RedirectRow[]; host: string }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<RedirectRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ row: RedirectRow | null } | null>(null)
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState('')
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

  function open(row: RedirectRow | null) {
    setForm(row ? { fromPath: row.fromPath, toPath: row.toPath } : initialForm)
    setFormError('')
    setDialog({ row })
  }
  const editing = dialog?.row || null

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError('')
    try {
      if (editing) await api('/api/admin/redirects', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...form }) })
      else await api('/api/admin/redirects', { method: 'POST', body: JSON.stringify(form) })
      await refresh(); setDialog(null)
    } catch (e) { setFormError(e instanceof Error ? e.message : editing ? 'Unable to update redirect' : 'Unable to create redirect') }
    finally { setSaving(false) }
  }

  async function remove(row: RedirectRow) {
    if (!(await confirm({ title: 'Delete this redirect?', message: `Visitors to ${row.fromPath} will no longer be sent on.`, confirmLabel: 'Delete redirect' }))) return
    setBusy(row.id); setError('')
    try { await api('/api/admin/redirects', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete redirect') }
    finally { setBusy(null) }
  }

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>URL redirects</h1><p className={ui.muted}>Send visitors from an old address on {host} to a new one. It is permanent (a 308 redirect), so search engines move the old page’s ranking over too.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15} aria-hidden="true" /> Refresh</button><button className={ui.btn} onClick={() => open(null)}><Plus size={16} aria-hidden="true" /> Create redirect</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

    <div className="catalogStats">
      <div className="statCard"><span>Redirects</span><strong>{rows.length}</strong></div>
      <div className="statCard"><span>Total hits</span><strong>{rows.reduce((sum, r) => sum + r.hits, 0).toLocaleString()}</strong></div>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Route size={16} aria-hidden="true" /><input placeholder="Search redirects…" aria-label="Search redirects" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="searchClear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}</div>
      <span className={ui.muted}>{filtered.length} redirect{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><AdminScrollArea label="Redirects"><table className={`${ui.table} productTable`} style={{ minWidth: 640 }}><thead><tr><th>From</th><th>To</th><th>Hits</th><th><span className={s.srOnly}>Actions</span></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><code>{row.fromPath}</code></td>
        <td><span className={s.toCell}><ArrowRight size={14} aria-hidden="true" /><code>{row.toPath}</code></span></td>
        <td>{row.hits.toLocaleString()}</td>
        <td><div className="inline"><button className={ui.iconBtn} title="Edit redirect" aria-label={`Edit the redirect from ${row.fromPath}`} onClick={() => open(row)}><Pencil size={15} aria-hidden="true" /></button><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete redirect" aria-label={`Delete the redirect from ${row.fromPath}`} disabled={busy === row.id} onClick={() => remove(row)}><Trash2 size={15} aria-hidden="true" /></button></div></td>
      </tr>)}
    </tbody></table></AdminScrollArea>
    {!filtered.length && <div className={ui.empty}><Route size={28} aria-hidden="true" />{query.trim()
      ? <><h2 className={s.emptyTitle}>No redirects match “{query.trim()}”</h2><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setQuery('')}>Clear search</button></>
      : <><h2 className={s.emptyTitle}>No redirects</h2><p className={ui.muted}>Create a redirect to send visitors from an old address to a new one.</p></>}</div>}
    </div>

    <AdminFormDialog open={!!dialog} eyebrow={editing ? 'EDIT REDIRECT' : 'CREATE REDIRECT'} title={editing ? editing.fromPath : 'New redirect'} busy={saving} onClose={() => setDialog(null)}>
      <form className="discountForm" onSubmit={submit}>
        <label className={ui.fieldLabel}>From<input className={ui.input} required value={form.fromPath} onChange={e => setForm({ ...form, fromPath: e.target.value })} placeholder="/old-page" aria-describedby="redirect-from-hint" data-autofocus /></label>
        <p id="redirect-from-hint" className={s.hint}>The old address visitors still arrive at, such as /old-page. A full address works too: only its path is used.</p>
        <label className={ui.fieldLabel}>To<input className={ui.input} required value={form.toPath} onChange={e => setForm({ ...form, toPath: e.target.value })} placeholder="/new-page or https://example.com" aria-describedby="redirect-to-hint" /></label>
        <p id="redirect-to-hint" className={s.hint}>A page on this store, such as /collections/sale, or a full address to send visitors elsewhere.</p>
        <DialogError error={formError} />
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDialog(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save changes' : 'Create redirect')}</button></div>
      </form>
    </AdminFormDialog>
  </div>
}
