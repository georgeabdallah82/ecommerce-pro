'use client'
import { useEffect, useRef, useState } from 'react'

// Thin bar at the top of the storefront while the next page loads. It replaces the old
// full-page app/loading.tsx skeleton: that boundary made every page start streaming before
// it knew whether the product/page existed, so missing pages answered "200 OK" instead of
// 404. Without it the server can send a real 404, and clicks still get instant feedback.
export function NavProgress() {
  const [width, setWidth] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const clear = () => { timers.current.forEach(t => window.clearInterval(t)); timers.current = [] }
    const finish = () => {
      clear()
      setWidth(100)
      timers.current.push(window.setTimeout(() => setWidth(0), 250) as unknown as number)
    }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      // A button inside a card link (wishlist heart, quick view) doesn't navigate.
      const control = target?.closest?.('button, [role=button], input, select, textarea')
      if (control && link.contains(control)) return
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return
      const destination = url.pathname + url.search
      if (destination === location.pathname + location.search) return
      clear()
      setWidth(12)
      const started = Date.now()
      timers.current.push(window.setInterval(() => {
        if (location.pathname + location.search === destination || Date.now() - started > 15000) finish()
        else setWidth(w => Math.min(90, w + (90 - w) * 0.08))
      }, 120))
    }
    // Capture phase: next/link cancels the click's default action before it bubbles here.
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', finish)
    return () => { clear(); document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', finish) }
  }, [])

  return <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, height: 3, zIndex: 10000, width: `${width}%`, opacity: width ? 1 : 0, background: 'var(--store-primary, #d42a2a)', transition: 'width .2s ease, opacity .25s ease', pointerEvents: 'none' }} />
}
