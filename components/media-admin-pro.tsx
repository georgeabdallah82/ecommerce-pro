'use client'
import { useMemo, useState } from 'react'
import { Copy, Grid2X2, Image as ImageIcon, List, Plus, Search, Upload, X } from 'lucide-react'

type MediaRow = {
  id: string
  url: string
  name: string
  alt?: string | null
  mimeType?: string | null
}

export default function MediaAdminPro({ initial }: { initial: MediaRow[] }) {
  const [rows, setRows] = useState<MediaRow[]>(initial || [])
  const [q, setQ] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [show, setShow] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const shown = useMemo(
    () => rows.filter(x => !q || `${x.name} ${x.alt || ''}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  )

  const resetForm = () => {
    setFile(null)
    setAlt('')
    setError('')
  }

  const closeModal = () => {
    if (uploading) return
    resetForm()
    setShow(false)
  }

  const upload = async () => {
    if (!file || uploading) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('alt', alt.trim())

      const r = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: form,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to upload image')

      setRows(prev => [d.asset as MediaRow, ...prev])
      closeModal()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to upload image')
    } finally {
      setUploading(false)
    }
  }

  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url)
  }

  return (
    <div className="mediaProPage">
      <div className="sectionHead">
        <div>
          <span className="muted">ONLINE STORE</span>
          <h1 className="h2">Files</h1>
          <p className="muted">Upload and manage storefront images and media assets in one place.</p>
        </div>
        <button className="btn" onClick={() => { setError(''); setShow(true) }}>
          <Plus size={15} /> Add file
        </button>
      </div>

      {error && !show && <div className="alert danger">{error}</div>}

      <div className="card mediaToolbar">
        <div className="mediaSearch">
          <Search size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search files…" />
        </div>
        <div className="inline">
          <span className="muted">{shown.length} files</span>
          <button className={view === 'grid' ? 'iconBtn active' : 'iconBtn'} onClick={() => setView('grid')}>
            <Grid2X2 size={15} />
          </button>
          <button className={view === 'list' ? 'iconBtn active' : 'iconBtn'} onClick={() => setView('list')}>
            <List size={15} />
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="mediaGrid">
          {shown.map(x => (
            <article className="mediaCard" key={x.id}>
              <div className="mediaThumb">
                {x.url ? <img src={x.url} alt={x.alt || x.name || ''} onError={e => { e.currentTarget.style.display = 'none' }} /> : <ImageIcon size={28} />}
              </div>
              <div className="mediaMeta">
                <strong title={x.name}>{x.name}</strong>
                <span className="muted">{x.mimeType || 'Image'}</span>
                <div className="inline">
                  <button className="iconBtn" title="Copy URL" onClick={() => copy(x.url)}><Copy size={14} /></button>
                  <a className="iconBtn" href={x.url} target="_blank" rel="noreferrer">↗</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Preview</th><th>Name</th><th>Alt text</th><th>Type</th><th>URL</th></tr></thead>
            <tbody>
              {shown.map(x => (
                <tr key={x.id}>
                  <td><div className="mediaListThumb"><img src={x.url} alt={x.alt || ''} /></div></td>
                  <td><strong>{x.name}</strong></td>
                  <td>{x.alt || '—'}</td>
                  <td>{x.mimeType || 'Image'}</td>
                  <td><button className="textButton" onClick={() => copy(x.url)}>Copy URL</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!shown.length && (
        <div className="card mediaEmpty">
          <ImageIcon size={26} />
          <strong>No files found</strong>
          <span className="muted">Add a file or try a different search.</span>
        </div>
      )}

      {show && (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="card mediaModal" onClick={e => e.stopPropagation()}>
            <div className="sectionHead small">
              <div>
                <h2 className="h3">Upload file</h2>
                <p className="muted">Choose an image from your computer and upload it to your media library.</p>
              </div>
              <button className="iconBtn" onClick={closeModal} disabled={uploading}><X size={16} /></button>
            </div>

            <label className="fieldLabel">
              Image
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={e => {
                  const selected = e.target.files?.[0] || null
                  setFile(selected)
                  setError('')
                }}
                disabled={uploading}
              />
            </label>

            {file && (
              <div className="muted" style={{ marginTop: 8 }}>
                Selected: <strong>{file.name}</strong> ({Math.ceil(file.size / 1024)} KB)
              </div>
            )}

            <label className="fieldLabel">
              Alt text
              <input className="input" value={alt} onChange={e => setAlt(e.target.value)} placeholder="Product or image description" disabled={uploading} />
            </label>

            {error && <div className="alert danger">{error}</div>}

            <div className="inline" style={{ justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={closeModal} disabled={uploading}>Cancel</button>
              <button className="btn" onClick={upload} disabled={!file || uploading}>
                <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
