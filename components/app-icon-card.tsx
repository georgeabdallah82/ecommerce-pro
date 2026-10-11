'use client'

import { useEffect, useState } from 'react'
import { ImagePlus, Smartphone } from 'lucide-react'
import { APP_ICON_LARGE, APP_ICON_PADDING, APP_ICON_SIZES, APP_ICON_SMALL, appShortName } from '@/lib/app-icon'
import MediaPicker from './media-picker'
import styles from './admin-app-icon.module.css'
import ui from './admin-ui.module.css'

// Pictures from another site go through the store's image proxy, so the canvas can read them.
function sameOrigin(src: string) {
  if (src.startsWith('/') && !src.startsWith('//')) return src
  try { return new URL(src).origin === window.location.origin ? src : `/api/image-proxy?url=${encodeURIComponent(src)}` } catch { return src }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That picture could not be loaded. Try another one.'))
    image.src = sameOrigin(src)
  })
}

// The logo, fitted in the middle of a square of the chosen colour, as a PNG.
async function drawIcon(src: string, size: number, background: string) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot make the icon. Try Chrome.')
  context.fillStyle = background
  context.fillRect(0, 0, size, size)
  const inner = size * (1 - 2 * APP_ICON_PADDING)
  const width = image.naturalWidth || inner
  const height = image.naturalHeight || inner
  const scale = Math.min(inner / width, inner / height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not make the icon.'))), 'image/png'))
}

async function upload(blob: Blob, name: string) {
  const body = new FormData()
  body.append('file', new File([blob], name, { type: 'image/png' }))
  body.append('alt', 'App icon')
  const response = await fetch('/api/admin/media/upload', { method: 'POST', body })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to upload the icon')
  return String(data.asset.url)
}

// Settings > General > Phone app: the icon and name customers get when they add the store to their
// home screen (app/manifest.ts). Made from the favicon or logo, or any picture from Files.
export default function AppIconCard({ brandName, source, saved, brandColor }: { brandName: string; source: string; saved: { large: string; small: string }; brandColor: string }) {
  const backgrounds = [
    { label: 'White', value: '#ffffff' },
    { label: 'Black', value: '#111111' },
    ...(/^#[0-9a-f]{6}$/i.test(brandColor) && brandColor.toLowerCase() !== '#ffffff' ? [{ label: 'Brand colour', value: brandColor }] : []),
  ]
  const [picture, setPicture] = useState(source)
  const [background, setBackground] = useState('#ffffff')
  const [preview, setPreview] = useState('')
  const [current, setCurrent] = useState(saved.small || saved.large)
  // With an icon already saved, it's shown until the owner changes the picture or background.
  const [editing, setEditing] = useState(!(saved.small || saved.large))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!picture || !editing) { setPreview(''); return }
    let url = ''
    let cancelled = false
    setError('')
    drawIcon(picture, APP_ICON_SIZES.small, background)
      .then(blob => { if (cancelled) return; url = URL.createObjectURL(blob); setPreview(url) })
      .catch(e => { if (!cancelled) { setPreview(''); setError(e instanceof Error ? e.message : 'Could not make the icon.') } })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [picture, background, editing])

  async function save() {
    if (!picture) return
    setBusy(true); setMessage(''); setError('')
    try {
      const [large, small] = await Promise.all([drawIcon(picture, APP_ICON_SIZES.large, background), drawIcon(picture, APP_ICON_SIZES.small, background)])
      const [largeUrl, smallUrl] = await Promise.all([upload(large, 'app-icon-512.png'), upload(small, 'app-icon-192.png')])
      const response = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { [APP_ICON_LARGE]: largeUrl, [APP_ICON_SMALL]: smallUrl } }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save the icon')
      setCurrent(smallUrl)
      setEditing(false)
      setMessage('Saved. Customers who add your store to their home screen now get this icon.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the icon')
    } finally {
      setBusy(false)
    }
  }

  const name = appShortName(brandName || 'Your store')
  const shown = preview || current
  return (
    <div className={styles.wrap}>
      <div className={styles.phone} aria-label="How it looks on a phone">
        <div className={styles.appTile}>
          {shown ? <img src={shown} alt="" /> : <span className={styles.empty}><Smartphone size={26} /></span>}
          <span>{name}</span>
        </div>
        <div className={styles.appTile} aria-hidden="true"><span className={styles.ghost} /><span>Photos</span></div>
        <div className={styles.appTile} aria-hidden="true"><span className={styles.ghost} /><span>WhatsApp</span></div>
      </div>

      <div className={styles.controls}>
        <p className={ui.fieldHelp}>Customers can add your store to their phone&apos;s home screen and open it like an app. On iPhone this is also how they get your notifications. {current && !editing ? 'This is your icon now.' : !current ? 'Tap Save app icon to use it.' : ''}</p>
        <div className={styles.row}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setPickerOpen(true)}><ImagePlus size={15} /> {picture ? 'Use another picture' : 'Choose a picture'}</button>
        </div>
        {picture && (
          <div className={styles.row} role="radiogroup" aria-label="Background">
            <span className={styles.label}>Background</span>
            {backgrounds.map(option => (
              <button key={option.value} type="button" role="radio" aria-checked={background === option.value} className={`${styles.swatch} ${background === option.value ? styles.swatchOn : ''}`} onClick={() => { setBackground(option.value); setEditing(true); setMessage('') }}>
                <span style={{ background: option.value }} aria-hidden="true" /> {option.label}
              </button>
            ))}
          </div>
        )}
        {picture && editing && <div className={styles.row}><button type="button" className={ui.btn} onClick={save} disabled={busy || !preview}>{busy ? 'Saving…' : 'Save app icon'}</button></div>}
        {!picture && <p className={ui.fieldHelp}>Add a logo or favicon in Online Store › Themes › Branding, or choose a picture above.</p>}
        {message && <div className={ui.alert}>{message}</div>}
        {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={images => { if (images[0]) { setPicture(images[0].url); setEditing(true); setMessage('') } setPickerOpen(false) }} />
    </div>
  )
}
