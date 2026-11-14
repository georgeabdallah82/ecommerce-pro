'use client'

import { useMemo, useState } from 'react'
import { Check, ExternalLink, FileText, LayoutTemplate, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { slugify } from '@/lib/slug'
import { RESERVED_HANDLES } from '@/lib/reserved-handles'
import ui from './admin-ui.module.css'
import s from './admin-content-editors.module.css'
import { useConfirm } from './admin-confirm'
import AdminFormDialog, { DialogError } from './admin-form-dialog'
import AdminScrollArea from './admin-scroll-area'
import RichTextEditor from './rich-text-editor'

type PageRow = { id: string; title: string; handle: string; bodyHtml: string | null; status: string; seoTitle: string | null; seoDescription: string | null; updatedAt: string }
type Form = { title: string; handle: string; bodyHtml: string; status: string; seoTitle: string; seoDescription: string }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm: Form = { title: '', handle: '', bodyHtml: '', status: 'DRAFT', seoTitle: '', seoDescription: '' }

// Admin > Online store > Pages (docs/admin-online-store-pages-2026-11.md). A page lives at the store's address
// followed by its handle (app/[handle]/page.tsx); `host` is that address without https://.
export default function PagesAdmin({ initial, host }: { initial: PageRow[]; host: string }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<PageRow[]>(initial || [])
  const [query, setQuery] = useState('')
  // The dialog: a new page, or the page being edited. `opened` counts openings so the text editor starts afresh.
  const [dialog, setDialog] = useState<{ row: PageRow | null; opened: number } | null>(null)
  const [form, setForm] = useState<Form>(initialForm)
  const [redirectOld, setRedirectOld] = useState(true)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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

  function open(row: PageRow | null) {
    setForm(row ? { title: row.title, handle: row.handle, bodyHtml: row.bodyHtml || '', status: row.status, seoTitle: row.seoTitle || '', seoDescription: row.seoDescription || '' } : initialForm)
    setRedirectOld(true); setFormError(''); setNotice('')
    setDialog(current => ({ row, opened: (current?.opened || 0) + 1 }))
  }

  const editing = dialog?.row || null
  const handle = slugify(form.handle || form.title).slice(0, 200)
  const moving = Boolean(editing && editing.status === 'PUBLISHED' && handle && handle !== editing.handle)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError('')
    try {
      if (editing) {
        const data = await api('/api/admin/pages', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...form, handle, redirectFromOld: moving && redirectOld }) })
        if (data.redirected) setNotice(`Saved. Visitors to /${editing.handle} are sent to /${data.page.handle}.`)
      } else {
        await api('/api/admin/pages', { method: 'POST', body: JSON.stringify({ ...form, handle }) })
      }
      await refresh(); setDialog(null)
    } catch (e) { setFormError(e instanceof Error ? e.message : editing ? 'Unable to update page' : 'Unable to create page') }
    finally { setSaving(false) }
  }

  async function remove(row: PageRow) {
    if (!(await confirm({ title: `Delete "${row.title}"?`, message: 'Visitors to this page will get a "not found" page. This cannot be undone.', confirmLabel: 'Delete page' }))) return
    setBusy(row.id); setError(''); setNotice('')
    try { await api('/api/admin/pages', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete page') }
    finally { setBusy(null) }
  }

  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }))

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>Pages</h1><p className={ui.muted}>Standalone pages such as About us or FAQ, each at {host}/its-address.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15} aria-hidden="true" /> Refresh</button><button className={ui.btn} onClick={() => open(null)}><Plus size={16} aria-hidden="true" /> Add page</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {notice && <div className={ui.alert} role="status">{notice}</div>}

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><FileText size={16} aria-hidden="true" /><input placeholder="Search pages…" aria-label="Search pages" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="searchClear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}</div>
      <span className={ui.muted}>{filtered.length} page{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><AdminScrollArea label="Pages"><table className={`${ui.table} productTable`} style={{ minWidth: 720 }}><thead><tr><th>Title</th><th>Address</th><th>Status</th><th><span className={s.srOnly}>Actions</span></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><strong>{row.title}</strong></td>
        <td><code>/{row.handle}</code></td>
        <td><span className={`${ui.statusPill} ${row.status === 'PUBLISHED' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{row.status === 'PUBLISHED' ? <><Check size={13} aria-hidden="true" /> Published</> : 'Draft'}</span></td>
        <td><div className="inline">{row.status === 'PUBLISHED' && <a className={ui.iconBtn} title={`View “${row.title}” on the store`} aria-label={`View “${row.title}” on the store (opens in a new tab)`} href={`/${row.handle}`} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /></a>}<a className={ui.iconBtn} title="Design this page with sections (products, collections, banners…)" aria-label={`Design “${row.title}” with sections`} href={`/admin/online-store/theme-editor?page=${row.id}`}><LayoutTemplate size={15} aria-hidden="true" /></a><button className={ui.iconBtn} title="Edit page" aria-label={`Edit “${row.title}”`} onClick={() => open(row)}><Pencil size={15} aria-hidden="true" /></button><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete page" aria-label={`Delete “${row.title}”`} disabled={busy === row.id} onClick={() => remove(row)}><Trash2 size={15} aria-hidden="true" /></button></div></td>
      </tr>)}
    </tbody></table></AdminScrollArea>
    {!filtered.length && <div className={ui.empty}><FileText size={28} aria-hidden="true" />{query.trim()
      ? <><h2 className={s.emptyTitle}>No pages match “{query.trim()}”</h2><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setQuery('')}>Clear search</button></>
      : <><h2 className={s.emptyTitle}>No pages</h2><p className={ui.muted}>Add a page like About us, FAQ or Contact.</p></>}</div>}
    </div>

    <AdminFormDialog open={!!dialog} eyebrow={editing ? 'EDIT PAGE' : 'CREATE PAGE'} title={editing ? editing.title : 'New page'} busy={saving} onClose={() => setDialog(null)}>
      <form className="discountForm" onSubmit={submit}>
        <label className={ui.fieldLabel}>Title<input className={ui.input} required maxLength={200} value={form.title} onChange={e => set({ title: e.target.value })} placeholder="About us" data-autofocus /></label>
        <label className={ui.fieldLabel}>Address <span className={ui.muted}>{editing ? '' : '(optional)'}</span><input className={ui.input} value={form.handle} onChange={e => set({ handle: e.target.value })} placeholder={editing ? '' : 'Made from the title if left blank'} aria-describedby="page-address" /></label>
        <p id="page-address" className={s.address}>{handle ? <>The page is at <strong>{host}/{handle}</strong>{RESERVED_HANDLES.has(handle) ? '. That address is already part of your store: choose another.' : ''}</> : 'Type a title to see the page’s address.'}</p>
        {moving && <label className={s.check}><input type="checkbox" checked={redirectOld} onChange={e => setRedirectOld(e.target.checked)} /><span>Send visitors from the old address, <strong>/{editing?.handle}</strong>, to the new one. Links and search results pointing at the old address keep working.</span></label>}
        <div className={s.field}><span>Content</span><RichTextEditor key={dialog?.opened} value={form.bodyHtml} onChange={html => set({ bodyHtml: html })} minHeight={200} label="Page content" /></div>
        <label className={ui.fieldLabel}>SEO title <span className={ui.muted}>(optional)</span><input className={ui.input} maxLength={200} value={form.seoTitle} onChange={e => set({ seoTitle: e.target.value })} placeholder={form.title} /></label>
        <label className={ui.fieldLabel}>SEO description <span className={ui.muted}>(optional)</span><input className={ui.input} maxLength={500} value={form.seoDescription} onChange={e => set({ seoDescription: e.target.value })} /></label>
        <label className={ui.fieldLabel}>Status<select className={ui.input} value={form.status} onChange={e => set({ status: e.target.value })}><option value="DRAFT">Draft (not on the store yet)</option><option value="PUBLISHED">Published</option></select></label>
        <DialogError error={formError} />
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDialog(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save changes' : 'Create page')}</button></div>
      </form>
    </AdminFormDialog>
  </div>
}
