'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, Search, UploadCloud, X } from 'lucide-react'
import s from './admin-media.module.css'
import ui from './admin-ui.module.css'
import { optimizeImage } from '@/lib/optimize-image'

type MediaAsset = { id: string; url: string; name: string; alt?: string | null }
type PickedImage = { url: string; alt?: string | null }

const PAGE = 48

// One page of the library, optionally filtered by a search term (app/api/admin/media).
async function fetchLibrary(skip: number, term: string): Promise<{ rows: MediaAsset[]; total: number }> {
  const params = new URLSearchParams({ skip: String(skip), take: String(PAGE) })
  if (term) params.set('q', term)
  const r = await fetch(`/api/admin/media?${params}`, { cache: 'no-store' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Unable to load your library')
  return { rows: Array.isArray(d.rows) ? d.rows : [], total: Number(d.total) || 0 }
}

export default function MediaPicker({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (images: PickedImage[]) => void }) {
  const [tab, setTab] = useState<'upload' | 'library'>('upload')
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [libraryTotal, setLibraryTotal] = useState(0)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [q, setQ] = useState('')
  // The search the library on screen was loaded for.
  const [applied, setApplied] = useState('')
  const requestId = useRef(0)
  const searchTimer = useRef<number | undefined>(undefined)
  // Picks are kept by id, so a file chosen on one page stays chosen when another page is shown.
  const [selected, setSelected] = useState<Map<string, MediaAsset>>(new Map())
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  // Loads the first page for a search term. A response that arrives after a newer request is ignored.
  async function loadFirst(term: string) {
    const id = ++requestId.current
    setLoadingLibrary(true)
    try {
      const d = await fetchLibrary(0, term)
      if (id === requestId.current) { setLibrary(d.rows); setLibraryTotal(d.total); setApplied(term) }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load your library')
    } finally {
      if (id === requestId.current) setLoadingLibrary(false)
    }
  }

  // Opening the picker starts again from the upload tab and the first page of the library.
  useEffect(() => {
    if (!open) return
    setTab('upload'); setSelected(new Map()); setFile(null); setAlt(''); setError(''); setQ('')
    loadFirst('')
  }, [open])

  useEffect(() => () => window.clearTimeout(searchTimer.current), [])

  function changeSearch(value: string) {
    setQ(value)
    window.clearTimeout(searchTimer.current)
    const term = value.trim()
    searchTimer.current = window.setTimeout(() => loadFirst(term), 250)
  }

  function loadMoreLibrary() {
    const id = requestId.current
    setLoadingLibrary(true)
    fetchLibrary(library.length, applied)
      .then(d => { if (id === requestId.current) { setLibrary(p => [...p, ...d.rows]); setLibraryTotal(d.total) } })
      .catch(e => { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load your library') })
      .finally(() => { if (id === requestId.current) setLoadingLibrary(false) })
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Only image files are allowed'); return }
    if (f.size > 25 * 1024 * 1024) { setError('Maximum file size is 25 MB'); return }
    setError(''); setFile(f); if (!alt) setAlt(f.name)
  }

  async function upload() {
    if (!file) return
    setBusy(true); setError('')
    try {
      // Resized to at most 1600px and re-encoded as WebP before upload (lib/optimize-image.ts).
      const optimized = await optimizeImage(file)
      if (optimized.size > 5 * 1024 * 1024) throw new Error('This image is still over 5 MB after resizing. Try a smaller file.')
      const body = new FormData()
      body.append('file', optimized)
      body.append('alt', alt || file.name)
      const r = await fetch('/api/admin/media/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to upload image')
      onAdd([{ url: d.asset.url, alt: d.asset.alt }])
      setFile(null); setAlt('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to upload image') } finally { setBusy(false) }
  }

  function toggle(asset: MediaAsset) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(asset.id)) next.delete(asset.id)
      else next.set(asset.id, asset)
      return next
    })
  }

  function addSelected() {
    const chosen = [...selected.values()].map(x => ({ url: x.url, alt: x.alt }))
    if (chosen.length) onAdd(chosen)
    onClose()
  }

  if (!open) return null
  return <div className={ui.modalOverlay} onClick={onClose}>
    <div className={`${ui.card} ${s.pickerModal}`} onClick={e => e.stopPropagation()}>
      <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h2 className={s.modalTitle}>Add media</h2><p className={ui.muted}>Upload a new image or choose one already in your library.</p></div><button className={ui.iconBtn} onClick={onClose}><X size={16} /></button></div>
      <div className={s.mediaTabs}>
        <button className={tab === 'upload' ? s.active : ''} onClick={() => { setTab('upload'); setError('') }}>Upload</button>
        <button className={tab === 'library' ? s.active : ''} onClick={() => { setTab('library'); setError('') }}>Library{libraryTotal ? ` (${libraryTotal})` : ''}</button>
      </div>
      {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

      <div className={s.pickerBody}>
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
          {file && <label className={ui.fieldLabel}>Alt text<input className={ui.input} value={alt} onChange={e => setAlt(e.target.value)} placeholder="Describe the image" /></label>}
        </> : <>
          <div className={s.mediaSearch} style={{ marginBottom: 12 }}><Search size={16} /><input value={q} onChange={e => changeSearch(e.target.value)} placeholder="Search library…" /></div>
          {!library.length && loadingLibrary ? <div className={ui.muted}>Loading…</div> : library.length ? <>
            <div className={s.libraryGrid}>
              {library.map(x => <button key={x.id} type="button" className={selected.has(x.id) ? `${s.libraryItem} ${s.selected}` : s.libraryItem} onClick={() => toggle(x)} title={x.name}>
                <img src={x.url} alt={x.alt || x.name} />
                <span className={s.libraryCheck}><Check size={12} /></span>
              </button>)}
            </div>
            {library.length < libraryTotal && <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={loadMoreLibrary} disabled={loadingLibrary}>{loadingLibrary ? 'Loading…' : `Load more (${libraryTotal - library.length} left)`}</button>
            </div>}
          </> : <div className={ui.muted}>{q.trim() ? 'No files match your search.' : 'No files in your library yet — switch to Upload to add one.'}</div>}
        </>}
      </div>

      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose}>{tab === 'upload' ? 'Done' : 'Cancel'}</button>
        {tab === 'upload'
          ? <button className={ui.btn} onClick={upload} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload & add'}</button>
          : <button className={ui.btn} onClick={addSelected} disabled={!selected.size}>Add {selected.size || ''} selected</button>}
      </div>
    </div>
  </div>
}
