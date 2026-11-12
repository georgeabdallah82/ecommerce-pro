'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

type Photo = { url: string; alt?: string }

// The product photo full screen, on white like the packshots themselves. Click (or tap) the
// photo to see it twice as large where you pointed; move the mouse to look around. Arrows or
// the buttons go to the next photo; Esc, the cross or the background close it. Focus moves to
// the close button, stays inside while it is open, and comes back to the button that opened it.
export default function PhotoZoom({ photos, index, onIndex, onClose }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const count = photos.length
  const go = (step: number) => { setZoom(null); onIndex((index + step + count) % count) }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    // The page itself is locked (see MarketMenu in components/market-chrome.tsx).
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = overflow; opener?.focus?.() }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Tab') {
        // Keep Tab inside the open photo: close, previous, next, round again.
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') || [])]
        if (!buttons.length) return
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        e.preventDefault()
        buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus()
      }
      else if (count > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const forward = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl')
        go(forward ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const point = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 }
  }
  const photo = photos[index] || photos[0]
  if (!photo) return null
  // Drawn on <body>, above the sticky header and the page's own layers.
  return createPortal(
    <div ref={dialogRef} className="pdpZoom" role="dialog" aria-modal="true" aria-label={t('Photo {n} of {total}', { n: index + 1, total: count })} onClick={onClose}>
      <button ref={closeRef} type="button" className="pdpZoomClose" onClick={onClose} aria-label={t('Close')}><X size={22} /></button>
      <figure className={`pdpZoomStage${zoom ? ' isZoomed' : ''}`} onClick={e => { e.stopPropagation(); setZoom(zoom ? null : point(e)) }} onMouseMove={e => { if (zoom) setZoom(point(e)) }}>
        <img src={photo.url} alt={photo.alt || ''} style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
      </figure>
      {count > 1 && <>
        <button type="button" className="pdpZoomNav prev" onClick={e => { e.stopPropagation(); go(-1) }} aria-label={t('Previous photo')}><ChevronLeft size={22} className="flipRtl" /></button>
        <button type="button" className="pdpZoomNav next" onClick={e => { e.stopPropagation(); go(1) }} aria-label={t('Next photo')}><ChevronRight size={22} className="flipRtl" /></button>
        <span className="pdpZoomCount" aria-live="polite">{index + 1} / {count}</span>
      </>}
    </div>,
    document.body
  )
}
