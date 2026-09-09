'use client'
import { useMemo, useRef, useState } from 'react'
import { Copy, Grid2X2, Image as ImageIcon, List, Plus, Search, UploadCloud, X } from 'lucide-react'
import s from './admin-media.module.css'

export default function MediaAdminPro({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState(initial || [])
  const [q, setQ] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [show, setShow] = useState(false)
  const [tab, setTab] = useState<'upload' | 'url'>('upload')
  const [form, setForm] = useState({ url: '', name: '', alt: '' })
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => rows.filter(x => !q || `${x.name} ${x.alt || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q])

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Only image files are allowed'); return }
    if (f.size > 5 * 1024 * 1024) { setError('Maximum file size is 5 MB'); return }
    setError('')
    setFile(f)
    if (!form.name) setForm(x => ({ ...x, name: f.name }))
  }

  async function uploadFile() {
    if (!file) return
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('alt', form.alt || form.name || file.name)
      const r = await fetch('/api/admin/media/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to upload image')
      setRows(p => [d.asset, ...p])
      resetForm()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to upload image') } finally { setBusy(false) }
  }

  async function addByUrl() {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/admin/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to add asset')
      setRows(p => [d.asset, ...p])
      resetForm()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add asset') } finally { setBusy(false) }
  }

  function resetForm() { setForm({ url: '', name: '', alt: '' }); setFile(null); setShow(false) }
  function openModal(t: 'upload' | 'url') { setTab(t); setError(''); setShow(true) }
  const copy = async (url: string) => { await navigator.clipboard?.writeText(url) }

  return <div className={s.mediaProPage}>
    <div className="sectionHead">
      <div><span className="muted">ONLINE STORE</span><h1 className="h2">Files</h1><p className="muted">Manage storefront images and media assets in one place.</p></div>
      <button className="btn" onClick={() => openModal('upload')}><Plus size={15} /> Add file</button>
    </div>
    {error && !show && <div className="alert danger">{error}</div>}
    <div className={`card ${s.mediaToolbar}`}>
      <div className={s.mediaSearch}><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files…" /></div>
      <div className="inline">
        <span className="muted">{shown.length} files</span>
        <button className={view === 'grid' ? 'iconBtn active' : 'iconBtn'} onClick={() => setView('grid')}><Grid2X2 size={15} /></button>
        <button className={view === 'list' ? 'iconBtn active' : 'iconBtn'} onClick={() => setView('list')}><List size={15} /></button>
      </div>
    </div>

    {view === 'grid'
      ? <div className={s.mediaGrid}>{shown.map(x => <article className={s.mediaCard} key={x.id}>
          <div className={s.mediaThumb}>{x.url ? <img src={x.url} alt={x.alt || x.name || ''} onError={e => { e.currentTarget.style.display = 'none' }} /> : <ImageIcon size={28} />}</div>
          <div className={s.mediaMeta}><strong title={x.name}>{x.name}</strong><span className="muted">{x.mimeType || 'Image'}</span>
            <div className={`inline ${s.inline}`}><button className="iconBtn" title="Copy URL" onClick={() => copy(x.url)}><Copy size={14} /></button><a className="iconBtn" href={x.url} target="_blank" rel="noreferrer">↗</a></div>
          </div>
        </article>)}</div>
      : <div className="card"><table className="table"><thead><tr><th>Preview</th><th>Name</th><th>Alt text</th><th>Type</th><th>URL</th></tr></thead><tbody>
          {shown.map(x => <tr key={x.id}><td><div className={s.mediaListThumb}><img src={x.url} alt={x.alt || ''} /></div></td><td><strong>{x.name}</strong></td><td>{x.alt || '—'}</td><td>{x.mimeType || 'Image'}</td><td><button className="textButton" onClick={() => copy(x.url)}>Copy URL</button></td></tr>)}
        </tbody></table></div>}
    {!shown.length && <div className={`card ${s.mediaEmpty}`}><ImageIcon size={26} /><strong>No files found</strong><span className="muted">Add a file or try a different search.</span></div>}

    {show && <div className="modalOverlay" onClick={() => setShow(false)}>
      <div className={`card ${s.mediaModal}`} onClick={e => e.stopPropagation()}>
        <div className="sectionHead small"><div><h2 className="h3">Add file</h2><p className="muted">Upload an image or link to a hosted asset.</p></div><button className="iconBtn" onClick={() => setShow(false)}><X size={16} /></button></div>
        <div className={s.mediaTabs}>
          <button className={tab === 'upload' ? 'active' : ''} onClick={() => { setTab('upload'); setError('') }}>Upload</button>
          <button className={tab === 'url' ? 'active' : ''} onClick={() => { setTab('url'); setError('') }}>Paste URL</button>
        </div>
        {error && <div className="alert danger">{error}</div>}

        {tab === 'upload' ? <>
          {file
            ? <div className={s.mediaPreviewRow}><img src={URL.createObjectURL(file)} alt="" /><div><strong>{file.name}</strong><div className="muted tiny">{(file.size / 1024).toFixed(0)} KB</div><button className="textButton" onClick={() => setFile(null)}>Choose a different file</button></div></div>
            : <div
                className={dragging ? `${s.mediaDropzone} ${s.dragging}` : s.mediaDropzone}
                onClick={() => fileInput.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}
              >
                <UploadCloud size={26} />
                <strong>Click to browse or drag an image here</strong>
                <span className="muted tiny">PNG, JPG, GIF up to 5 MB</span>
                <input ref={fileInput} type="file" accept="image/*" onChange={e => pickFile(e.target.files?.[0])} />
              </div>}
          <label className="fieldLabel">Alt text<input className="input" value={form.alt} onChange={e => setForm({ ...form, alt: e.target.value })} placeholder="Describe the image" /></label>
          <div className="inline" style={{ justifyContent: 'flex-end' }}><button className="btn secondary" onClick={() => setShow(false)}>Cancel</button><button className="btn" onClick={uploadFile} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload'}</button></div>
        </> : <>
          <label className="fieldLabel">URL<input className="input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
          <label className="fieldLabel">Name<input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Hero image" /></label>
          <label className="fieldLabel">Alt text<input className="input" value={form.alt} onChange={e => setForm({ ...form, alt: e.target.value })} /></label>
          <div className="inline" style={{ justifyContent: 'flex-end' }}><button className="btn secondary" onClick={() => setShow(false)}>Cancel</button><button className="btn" onClick={addByUrl} disabled={!form.url.trim() || busy}>{busy ? 'Adding…' : 'Add file'}</button></div>
        </>}
      </div>
    </div>}
  </div>
}
