'use client'

import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

const MAX = 3
const MAX_SIDE = 1600

// Phone photos are often 4-10 MB: made smaller here (longest side 1600 px, JPEG) before upload,
// which also drops the location the camera stored in the file.
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('unreadable'))
      el.src = url
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('unreadable')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('unreadable')), 'image/jpeg', 0.82))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// "Add photos" for one product on the review page (app/review/[orderNumber]/form.tsx).
export default function ReviewPhotoPicker({ orderNumber, token, photos, onChange, onBusy }: { orderNumber: string; token: string; photos: string[]; onChange: (photos: string[]) => void; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')

  async function add(files: FileList | null) {
    setError('')
    const chosen = Array.from(files || []).filter(f => f.type.startsWith('image/')).slice(0, MAX - photos.length)
    if (!chosen.length) return
    setUploading(chosen.length)
    onBusy(true)
    let current = photos
    for (const file of chosen) {
      try {
        const blob = await shrink(file)
        const form = new FormData()
        form.set('orderNumber', orderNumber)
        form.set('token', token)
        form.set('file', blob, 'photo.jpg')
        const r = await fetch('/api/reviews/photo', { method: 'POST', body: form })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.url) throw new Error(t(String(d.error || 'Unable to add the photo right now')))
        current = [...current, String(d.url)].slice(0, MAX)
        onChange(current)
      } catch (err) {
        setError(err instanceof Error && err.message !== 'unreadable' ? err.message : t('This photo could not be read. Try another one.'))
      } finally {
        setUploading(n => Math.max(0, n - 1))
      }
    }
    onBusy(false)
    if (input.current) input.current.value = ''
  }

  return <div className="reviewPhotos">
    {photos.length > 0 && <div className="reviewPhotoList">
      {photos.map(url => <span key={url} className="reviewPhotoThumb">
        <img src={url} alt="" width={72} height={72} />
        <button type="button" onClick={() => onChange(photos.filter(p => p !== url))} aria-label={t('Remove photo')}><X size={14} /></button>
      </span>)}
    </div>}
    {photos.length < MAX && <>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => add(e.target.files)} />
      <button type="button" className="reviewPhotoAdd" onClick={() => input.current?.click()} disabled={uploading > 0}>
        <Camera size={18} /> {uploading > 0 ? t('Adding photo…') : photos.length ? t('Add another photo') : t('Add photos (optional)')}
      </button>
    </>}
    {error && <p className="reviewPhotoError" role="alert">{error}</p>}
  </div>
}
