'use client'

import { useMemo, useState } from 'react'
import { Check, ExternalLink, ImagePlus, Newspaper, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { slugify } from '@/lib/slug'
import { withTyped } from '@/lib/tag-input'
import ui from './admin-ui.module.css'
import b from './admin-blog-posts.module.css'
import s from './admin-content-editors.module.css'
import { useConfirm } from './admin-confirm'
import AdminFormDialog, { DialogError } from './admin-form-dialog'
import AdminScrollArea from './admin-scroll-area'
import MediaPicker from './media-picker'
import RichTextEditor from './rich-text-editor'

type PostRow = { id: string; title: string; handle: string; excerpt: string | null; bodyHtml: string | null; featuredImage: string | null; status: string; tags: string[]; seoTitle: string | null; seoDescription: string | null; updatedAt: string }
type Form = { title: string; handle: string; excerpt: string; bodyHtml: string; featuredImage: string; status: string; tags: string[]; seoTitle: string; seoDescription: string }

function TagEditor({ id, tags, typed, onTags, onTyped }: { id: string; tags: string[]; typed: string; onTags: (tags: string[]) => void; onTyped: (text: string) => void }) {
  const commit = (text: string) => { onTags(withTyped(tags, text)); onTyped('') }
  return <div className={b.tagRow}>
    {tags.map((t, i) => <span className={b.tagChip} key={t}>{t}<button type="button" aria-label={`Remove the tag ${t}`} onClick={() => onTags(tags.filter((_, n) => n !== i))}><X size={12} aria-hidden="true" /></button></span>)}
    <input id={id} className={`${ui.input} ${b.tagRowField}`} value={typed} placeholder="Type a tag, then Enter" aria-describedby={`${id}-hint`}
      onChange={e => { const v = e.target.value; if (v.includes(',')) commit(v); else onTyped(v) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(typed) }
        else if (e.key === 'Backspace' && !typed && tags.length) onTags(tags.slice(0, -1))
      }} />
    <span id={`${id}-hint`} className={s.srOnly}>Enter or a comma adds a tag. Backspace in the empty box removes the last one.</span>
  </div>
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

const initialForm: Form = { title: '', handle: '', excerpt: '', bodyHtml: '', featuredImage: '', status: 'DRAFT', tags: [], seoTitle: '', seoDescription: '' }

// Admin > Online store > Blog (docs/admin-online-store-pages-2026-11.md). Posts are at the store's address, /blog/
// and the post's handle; `host` is the store's address without https://.
export default function BlogPostsAdmin({ initial, host }: { initial: PostRow[]; host: string }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState<PostRow[]>(initial || [])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ row: PostRow | null; opened: number } | null>(null)
  const [form, setForm] = useState<Form>(initialForm)
  const [typedTag, setTypedTag] = useState('')
  const [picking, setPicking] = useState(false)
  const [redirectOld, setRedirectOld] = useState(true)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(() => rows.filter(r => {
    const q = query.trim().toLowerCase()
    return !q || `${r.title} ${r.handle} ${(r.tags || []).join(' ')}`.toLowerCase().includes(q)
  }), [rows, query])

  async function refresh() {
    setError('')
    try { setRows(await api('/api/admin/blog-posts')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load posts') }
  }

  function open(row: PostRow | null) {
    setForm(row ? { title: row.title, handle: row.handle, excerpt: row.excerpt || '', bodyHtml: row.bodyHtml || '', featuredImage: row.featuredImage || '', status: row.status, tags: row.tags || [], seoTitle: row.seoTitle || '', seoDescription: row.seoDescription || '' } : initialForm)
    setTypedTag(''); setPicking(false); setRedirectOld(true); setFormError(''); setNotice('')
    setDialog(current => ({ row, opened: (current?.opened || 0) + 1 }))
  }

  const editing = dialog?.row || null
  const handle = slugify(form.handle || form.title).slice(0, 200)
  const moving = Boolean(editing && editing.status === 'PUBLISHED' && handle && handle !== editing.handle)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError('')
    const body = { ...form, handle, tags: withTyped(form.tags, typedTag) }
    try {
      if (editing) {
        const data = await api('/api/admin/blog-posts', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...body, redirectFromOld: moving && redirectOld }) })
        if (data.redirected) setNotice(`Saved. Readers of /blog/${editing.handle} are sent to /blog/${data.post.handle}.`)
      } else {
        await api('/api/admin/blog-posts', { method: 'POST', body: JSON.stringify(body) })
      }
      await refresh(); setDialog(null)
    } catch (e) { setFormError(e instanceof Error ? e.message : editing ? 'Unable to update post' : 'Unable to create post') }
    finally { setSaving(false) }
  }

  async function remove(row: PostRow) {
    if (!(await confirm({ title: `Delete "${row.title}"?`, message: 'The post is removed from your blog. This cannot be undone.', confirmLabel: 'Delete post' }))) return
    setBusy(row.id); setError(''); setNotice('')
    try { await api('/api/admin/blog-posts', { method: 'DELETE', body: JSON.stringify({ id: row.id }) }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete post') }
    finally { setBusy(null) }
  }

  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }))

  return <div className="catalogPage">
    <div className={`${ui.sectionHead} catalogHead`}><div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>Blog</h1><p className={ui.muted}>Published posts appear at {host}/blog.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}><RefreshCw size={15} aria-hidden="true" /> Refresh</button><button className={ui.btn} onClick={() => open(null)}><Plus size={16} aria-hidden="true" /> Add post</button></div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {notice && <div className={ui.alert} role="status">{notice}</div>}

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Newspaper size={16} aria-hidden="true" /><input placeholder="Search posts…" aria-label="Search posts" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="searchClear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} aria-hidden="true" /></button>}</div>
      <span className={ui.muted}>{filtered.length} post{filtered.length === 1 ? '' : 's'}</span>
    </div>

    <div className={`${ui.card} productTableCard`}><AdminScrollArea label="Posts"><table className={`${ui.table} productTable`} style={{ minWidth: 720 }}><thead><tr><th>Title</th><th>Address</th><th>Tags</th><th>Status</th><th><span className={s.srOnly}>Actions</span></th></tr></thead><tbody>
      {filtered.map(row => <tr key={row.id}>
        <td><strong>{row.title}</strong></td>
        <td><code>/blog/{row.handle}</code></td>
        <td>{row.tags?.length ? row.tags.join(', ') : <span className={ui.muted}>—</span>}</td>
        <td><span className={`${ui.statusPill} ${row.status === 'PUBLISHED' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{row.status === 'PUBLISHED' ? <><Check size={13} aria-hidden="true" /> Published</> : 'Draft'}</span></td>
        <td><div className="inline">{row.status === 'PUBLISHED' && <a className={ui.iconBtn} title={`View “${row.title}” on the store`} aria-label={`View “${row.title}” on the store (opens in a new tab)`} href={`/blog/${row.handle}`} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /></a>}<button className={ui.iconBtn} title="Edit post" aria-label={`Edit “${row.title}”`} onClick={() => open(row)}><Pencil size={15} aria-hidden="true" /></button><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete post" aria-label={`Delete “${row.title}”`} disabled={busy === row.id} onClick={() => remove(row)}><Trash2 size={15} aria-hidden="true" /></button></div></td>
      </tr>)}
    </tbody></table></AdminScrollArea>
    {!filtered.length && <div className={ui.empty}><Newspaper size={28} aria-hidden="true" />{query.trim()
      ? <><h2 className={s.emptyTitle}>No posts match “{query.trim()}”</h2><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setQuery('')}>Clear search</button></>
      : <><h2 className={s.emptyTitle}>No posts</h2><p className={ui.muted}>Add your first blog post.</p></>}</div>}
    </div>

    {/* While the image picker is open, Escape closes the picker, not the post. */}
    <AdminFormDialog open={!!dialog} eyebrow={editing ? 'EDIT POST' : 'CREATE POST'} title={editing ? editing.title : 'New blog post'} busy={saving} onClose={() => { if (picking) setPicking(false); else setDialog(null) }}>
      <form className="discountForm" onSubmit={submit}>
        <label className={ui.fieldLabel}>Title<input className={ui.input} required maxLength={200} value={form.title} onChange={e => set({ title: e.target.value })} placeholder="5 tips for…" data-autofocus /></label>
        <label className={ui.fieldLabel}>Address <span className={ui.muted}>{editing ? '' : '(optional)'}</span><input className={ui.input} value={form.handle} onChange={e => set({ handle: e.target.value })} placeholder={editing ? '' : 'Made from the title if left blank'} aria-describedby="post-address" /></label>
        <p id="post-address" className={s.address}>{handle ? <>The post is at <strong>{host}/blog/{handle}</strong></> : 'Type a title to see the post’s address.'}</p>
        {moving && <label className={s.check}><input type="checkbox" checked={redirectOld} onChange={e => setRedirectOld(e.target.checked)} /><span>Send readers from the old address, <strong>/blog/{editing?.handle}</strong>, to the new one. Links and search results pointing at the old address keep working.</span></label>}
        <label className={ui.fieldLabel}>Excerpt <span className={ui.muted}>(optional, shown on the blog page)</span><input className={ui.input} maxLength={500} value={form.excerpt} onChange={e => set({ excerpt: e.target.value })} /></label>
        <div className={s.field}><span id="post-image-label">Featured image <span className={ui.muted}>(optional)</span></span>
          <div className={s.imageRow}>
            {form.featuredImage ? <img src={form.featuredImage} alt="" /> : null}
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setPicking(true)}><ImagePlus size={15} aria-hidden="true" /> {form.featuredImage ? 'Change image' : 'Choose from Files'}</button>
            {form.featuredImage ? <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => set({ featuredImage: '' })}><X size={15} aria-hidden="true" /> Remove</button> : null}
            <input className={ui.input} value={form.featuredImage} onChange={e => set({ featuredImage: e.target.value })} placeholder="or paste an image address (https://…)" aria-labelledby="post-image-label" />
          </div>
        </div>
        <div className={s.field}><span>Content</span><RichTextEditor key={dialog?.opened} value={form.bodyHtml} onChange={html => set({ bodyHtml: html })} minHeight={200} label="Post content" /></div>
        <div className={s.field}><label htmlFor="post-tags">Tags <span className={ui.muted}>(optional)</span></label><TagEditor id="post-tags" tags={form.tags} typed={typedTag} onTags={tags => set({ tags })} onTyped={setTypedTag} /></div>
        <label className={ui.fieldLabel}>SEO title <span className={ui.muted}>(optional)</span><input className={ui.input} maxLength={200} value={form.seoTitle} onChange={e => set({ seoTitle: e.target.value })} placeholder={form.title} /></label>
        <label className={ui.fieldLabel}>SEO description <span className={ui.muted}>(optional)</span><input className={ui.input} maxLength={500} value={form.seoDescription} onChange={e => set({ seoDescription: e.target.value })} placeholder={form.excerpt} /></label>
        <label className={ui.fieldLabel}>Status<select className={ui.input} value={form.status} onChange={e => set({ status: e.target.value })}><option value="DRAFT">Draft (not on the store yet)</option><option value="PUBLISHED">Published</option></select></label>
        <DialogError error={formError} />
        <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setDialog(null)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save changes' : 'Create post')}</button></div>
      </form>
      {/* Outside the form: the picker's own buttons would otherwise submit the post. */}
      <MediaPicker open={picking} onClose={() => setPicking(false)} onAdd={images => { if (images[0]) set({ featuredImage: images[0].url }); setPicking(false) }} />
    </AdminFormDialog>
  </div>
}
