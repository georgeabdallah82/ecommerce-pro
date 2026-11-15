'use client'
import { useEffect, useRef, useState } from 'react'
import { Copy, Grid2X2, Image as ImageIcon, List, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react'
import s from './admin-media.module.css'
import ui from './admin-ui.module.css'
import { optimizeImage } from '@/lib/optimize-image'
import { useConfirm } from './admin-confirm'
import { fetchRead } from '@/lib/retry-fetch'

// Files are read a page at a time (app/api/admin/media). The search runs on the server.
const PAGE = 48

async function fetchFiles(skip: number, term: string): Promise<{ rows: any[]; total: number }> {
  const params = new URLSearchParams({ skip: String(skip), take: String(PAGE) })
  if (term) params.set('q', term)
  const r = await fetchRead(`/api/admin/media?${params}`, { cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Unable to load files')
  return { rows: Array.isArray(d.rows) ? d.rows : [], total: Number(d.total) || 0 }
}

export default function MediaAdminPro({ initial, total: initialTotal }: { initial: any[]; total: number }) {
  const [rows, setRows] = useState<any[]>(initial || [])
  const [total, setTotal] = useState(initialTotal)
  const [q, setQ] = useState('')
  // The search the files on screen were loaded for.
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [show, setShow] = useState(false)
  const [tab, setTab] = useState<'upload' | 'url'>('upload')
  const [form, setForm] = useState({ url: '', name: '', alt: '' })
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const confirm = useConfirm()

  // A new search loads its first page once typing pauses. Any request still in flight is then stale.
  useEffect(() => {
    const term = q.trim()
    const id = ++requestId.current
    if (term === applied) { setLoading(false); return }
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetchFiles(0, term)
        .then(d => { if (id === requestId.current) { setRows(d.rows); setTotal(d.total); setApplied(term) } })
        .catch(e => { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load files') })
        .finally(() => { if (id === requestId.current) setLoading(false) })
    }, term ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [q, applied])

  async function loadMore() {
    const id = requestId.current
    setLoading(true)
    try {
      const d = await fetchFiles(rows.length, applied)
      if (id === requestId.current) { setRows(p => [...p, ...d.rows]); setTotal(d.total) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load files')
    } finally {
      setLoading(false)
    }
  }

  // With no search on, a new file goes on top. During a search it is shown only if it matches, so the first page is reloaded.
  async function added(asset: any) {
    if (!applied) { setRows(p => [asset, ...p]); setTotal(t => t + 1); return }
    const id = ++requestId.current
    try {
      const d = await fetchFiles(0, applied)
      if (id === requestId.current) { setRows(d.rows); setTotal(d.total) }
    } catch {}
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Only image files are allowed'); return }
    if (f.size > 25 * 1024 * 1024) { setError('Maximum file size is 25 MB'); return }
    setError('')
    setFile(f)
    if (!form.name) setForm(x => ({ ...x, name: f.name }))
  }

  async function uploadFile() {
    if (!file) return
    setBusy(true); setError('')
    try {
      // Resized to at most 1600px and re-encoded as WebP before upload (lib/optimize-image.ts).
      const optimized = await optimizeImage(file)
      if (optimized.size > 5 * 1024 * 1024) throw new Error('This image is still over 5 MB after resizing. Try a smaller file.')
      const body = new FormData()
      body.append('file', optimized)
      body.append('alt', form.alt || form.name || file.name)
      const r = await fetch('/api/admin/media/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to upload image')
      await added(d.asset)
      resetForm()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to upload image') } finally { setBusy(false) }
  }

  async function addByUrl() {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/admin/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to add asset')
      await added(d.asset)
      resetForm()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add asset') } finally { setBusy(false) }
  }

  async function remove(asset: any) {
    setError('')
    setDeleting(asset.id)
    try {
      // Warn first if the image is still shown somewhere in the store.
      const u = await fetchRead(`/api/admin/media/${asset.id}`).then(r => r.ok ? r.json() : { usedIn: [] }).catch(() => ({ usedIn: [] }))
      const usedIn: string[] = Array.isArray(u.usedIn) ? u.usedIn : []
      const message = usedIn.length
        ? `This image is still used in: ${usedIn.join(' · ')}. After deleting, it will no longer show there. This cannot be undone.`
        : 'It is not used anywhere in your store. This cannot be undone.'
      if (!(await confirm({ title: `Delete "${asset.name}"?`, message, confirmLabel: usedIn.length ? 'Delete anyway' : 'Delete file' }))) return
      const r = await fetch(`/api/admin/media/${asset.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to delete file')
      setRows(p => p.filter(x => x.id !== asset.id))
      setTotal(t => Math.max(0, t - 1))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete file') } finally { setDeleting(null) }
  }

  function resetForm() { setForm({ url: '', name: '', alt: '' }); setFile(null); setShow(false) }
  function openModal(t: 'upload' | 'url') { setTab(t); setError(''); setShow(true) }
  const copy = async (url: string) => { await navigator.clipboard?.writeText(url) }

  return <div className={s.mediaProPage}>
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>ONLINE STORE</span><h1 className={ui.title}>Files</h1><p className={ui.muted}>Manage storefront images and media assets in one place.</p></div>
      <button className={ui.btn} onClick={() => openModal('upload')}><Plus size={15} /> Add file</button>
    </div>
    {error && !show && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className={`${ui.card} ${s.mediaToolbar}`}>
      <div className={s.mediaSearch}><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files…" /></div>
      <div className="inline">
        <span className={ui.muted}>{rows.length} of {total} files</span>
        <button className={`${ui.iconBtn} ${view === 'grid' ? s.viewToggleActive : ''}`} onClick={() => setView('grid')}><Grid2X2 size={15} /></button>
        <button className={`${ui.iconBtn} ${view === 'list' ? s.viewToggleActive : ''}`} onClick={() => setView('list')}><List size={15} /></button>
      </div>
    </div>

    {view === 'grid'
      ? <div className={s.mediaGrid}>{rows.map(x => <article className={s.mediaCard} key={x.id}>
          <div className={s.mediaThumb}>{x.url ? <img src={x.url} alt={x.alt || x.name || ''} onError={e => { e.currentTarget.style.display = 'none' }} /> : <ImageIcon size={28} />}</div>
          <div className={s.mediaMeta}><strong title={x.name}>{x.name}</strong><span className={ui.muted}>{x.mimeType || 'Image'}</span>
            <div className={`inline ${s.inline}`}><button className={ui.iconBtn} title="Copy URL" aria-label="Copy URL" onClick={() => copy(x.url)}><Copy size={14} /></button><a className={ui.iconBtn} href={x.url} target="_blank" rel="noreferrer">↗</a><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete file" aria-label={`Delete ${x.name}`} disabled={deleting === x.id} onClick={() => remove(x)}><Trash2 size={14} /></button></div>
          </div>
        </article>)}</div>
      : <div className={ui.card}><table className={ui.table}><thead><tr><th>Preview</th><th>Name</th><th>Alt text</th><th>Type</th><th>URL</th><th></th></tr></thead><tbody>
          {rows.map(x => <tr key={x.id}><td><div className={s.mediaListThumb}><img src={x.url} alt={x.alt || ''} /></div></td><td><strong>{x.name}</strong></td><td>{x.alt || '—'}</td><td>{x.mimeType || 'Image'}</td><td><button className={ui.textButton} onClick={() => copy(x.url)}>Copy URL</button></td><td><button className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete file" aria-label={`Delete ${x.name}`} disabled={deleting === x.id} onClick={() => remove(x)}><Trash2 size={14} /></button></td></tr>)}
        </tbody></table></div>}
    {!rows.length && !loading && <div className={`${ui.card} ${s.mediaEmpty}`}><ImageIcon size={26} /><strong>No files found</strong><span className={ui.muted}>Add a file or try a different search.</span></div>}
    {rows.length < total && <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
      <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={loadMore} disabled={loading}>{loading ? 'Loading…' : `Load more (${total - rows.length} left)`}</button>
    </div>}

    {show && <div className={ui.modalOverlay} onClick={() => setShow(false)}>
      <div className={`${ui.card} ${s.mediaModal}`} onClick={e => e.stopPropagation()}>
        <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h2 className={s.modalTitle}>Add file</h2><p className={ui.muted}>Upload an image or link to a hosted asset.</p></div><button className={ui.iconBtn} onClick={() => setShow(false)}><X size={16} /></button></div>
        <div className={s.mediaTabs}>
          <button className={tab === 'upload' ? s.active : ''} onClick={() => { setTab('upload'); setError('') }}>Upload</button>
          <button className={tab === 'url' ? s.active : ''} onClick={() => { setTab('url'); setError('') }}>Paste URL</button>
        </div>
        {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

        {tab === 'upload' ? <>
          {file
            ? <div className={s.mediaPreviewRow}><img src={URL.createObjectURL(file)} alt="" /><div><strong>{file.name}</strong><div className={`${ui.muted} ${ui.tiny}`}>{(file.size / 1024).toFixed(0)} KB</div><button className={ui.textButton} onClick={() => setFile(null)}>Choose a different file</button></div></div>
            : <div
                className={dragging ? `${s.mediaDropzone} ${s.dragging}` : s.mediaDropzone}
                onClick={() => fileInput.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}
              >
                <UploadCloud size={26} />
                <strong>Click to browse or drag an image here</strong>
                <span className={`${ui.muted} ${ui.tiny}`}>PNG, JPG, WebP, GIF or SVG. Photos are resized for fast loading.</span>
                <input ref={fileInput} type="file" accept="image/*" onChange={e => pickFile(e.target.files?.[0])} />
              </div>}
          <label className={ui.fieldLabel}>Alt text<input className={ui.input} value={form.alt} onChange={e => setForm({ ...form, alt: e.target.value })} placeholder="Describe the image" /></label>
          <div className="inline" style={{ justifyContent: 'flex-end' }}><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShow(false)}>Cancel</button><button className={ui.btn} onClick={uploadFile} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload'}</button></div>
        </> : <>
          <label className={ui.fieldLabel}>URL<input className={ui.input} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
          <label className={ui.fieldLabel}>Name<input className={ui.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Hero image" /></label>
          <label className={ui.fieldLabel}>Alt text<input className={ui.input} value={form.alt} onChange={e => setForm({ ...form, alt: e.target.value })} /></label>
          <div className="inline" style={{ justifyContent: 'flex-end' }}><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShow(false)}>Cancel</button><button className={ui.btn} onClick={addByUrl} disabled={!form.url.trim() || busy}>{busy ? 'Adding…' : 'Add file'}</button></div>
        </>}
      </div>
    </div>}
  </div>
}
