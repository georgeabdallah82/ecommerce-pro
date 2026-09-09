'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, UploadCloud, X } from 'lucide-react'
import s from './admin-media.module.css'

type MediaAsset = { id: string; url: string; name: string; alt?: string | null }
type PickedImage = { url: string; alt?: string | null }

export default function MediaPicker({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (images: PickedImage[]) => void }) {
  const [tab, setTab] = useState<'upload' | 'library'>('upload')
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTab('upload'); setSelected(new Set()); setFile(null); setAlt(''); setError('')
    setLoadingLibrary(true)
    fetch('/api/admin/media').then(r => r.json()).then(rows => setLibrary(Array.isArray(rows) ? rows : [])).catch(() => setLibrary([])).finally(() => setLoadingLibrary(false))
  }, [open])

  const shownLibrary = useMemo(() => library.filter(x => !q || `${x.name} ${x.alt || ''}`.toLowerCase().includes(q.toLowerCase())), [library, q])

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Only image files are allowed'); return }
    if (f.size > 5 * 1024 * 1024) { setError('Maximum file size is 5 MB'); return }
    setError(''); setFile(f); if (!alt) setAlt(f.name)
  }

  async function upload() {
    if (!file) return
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('alt', alt || file.name)
      const r = await fetch('/api/admin/media/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to upload image')
      onAdd([{ url: d.asset.url, alt: d.asset.alt }])
      setFile(null); setAlt('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to upload image') } finally { setBusy(false) }
  }

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function addSelected() {
    const chosen = library.filter(x => selected.has(x.id)).map(x => ({ url: x.url, alt: x.alt }))
    if (chosen.length) onAdd(chosen)
    onClose()
  }

  if (!open) return null
  return <div className="modalOverlay" onClick={onClose}>
    <div className={`card ${s.pickerModal}`} onClick={e => e.stopPropagation()}>
      <div className="sectionHead small"><div><h2 className="h3">Add media</h2><p className="muted">Upload a new image or choose one already in your library.</p></div><button className="iconBtn" onClick={onClose}><X size={16} /></button></div>
      <div className={s.mediaTabs}>
        <button className={tab === 'upload' ? 'active' : ''} onClick={() => { setTab('upload'); setError('') }}>Upload</button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => { setTab('library'); setError('') }}>Library{library.length ? ` (${library.length})` : ''}</button>
      </div>
      {error && <div className="alert danger">{error}</div>}

      <div className={s.pickerBody}>
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
          {file && <label className="fieldLabel">Alt text<input className="input" value={alt} onChange={e => setAlt(e.target.value)} placeholder="Describe the image" /></label>}
        </> : <>
          <div className={s.mediaSearch} style={{ marginBottom: 12 }}><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search library…" /></div>
          {loadingLibrary ? <div className="muted">Loading…</div> : shownLibrary.length ? <div className={s.libraryGrid}>
            {shownLibrary.map(x => <button key={x.id} type="button" className={selected.has(x.id) ? `${s.libraryItem} ${s.selected}` : s.libraryItem} onClick={() => toggle(x.id)} title={x.name}>
              <img src={x.url} alt={x.alt || x.name} />
              <span className={s.libraryCheck}><Check size={12} /></span>
            </button>)}
          </div> : <div className="muted">No files in your library yet — switch to Upload to add one.</div>}
        </>}
      </div>

      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <button className="btn secondary" onClick={onClose}>{tab === 'upload' ? 'Done' : 'Cancel'}</button>
        {tab === 'upload'
          ? <button className="btn" onClick={upload} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload & add'}</button>
          : <button className="btn" onClick={addSelected} disabled={!selected.size}>Add {selected.size || ''} selected</button>}
      </div>
    </div>
  </div>
}
