'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Megaphone, X } from 'lucide-react'
import s from './team-notices.module.css'
import { fetchRead } from '@/lib/retry-fetch'

// The team notice board at the top of every admin page (lib/team-notices.ts). "Got it" hides a notice on
// this device only; it comes back on other devices until they tap it too, or until it expires.
//
// The page that is already open keeps up to date by itself: it asks for the notices when the app is
// opened or switched back to, on every page change, when a phone alert about a notice arrives (the
// service worker tells the page), and every couple of minutes while the page is on screen. So a notice
// reaches a phone that has had the admin open for days, not only after a reload.

export type ShownNotice = { id: string; text: string; authorName: string; age: string }
const seenKey = (id: string) => `yh_notice_seen_${id}`
const EVERY_MS = 2 * 60_000
const MIN_GAP_MS = 15_000

export default function TeamNotices({ notices: initial }: { notices: ShownNotice[] }) {
  const pathname = usePathname()
  const [notices, setNotices] = useState(initial)
  // Nothing is drawn until the device's own "Got it" list has been read, so a notice already
  // dismissed here never flashes on screen.
  const [seen, setSeen] = useState<Record<string, boolean> | null>(null)
  const lastFetch = useRef(0)

  useEffect(() => {
    const done: Record<string, boolean> = {}
    for (const n of notices) { try { if (window.localStorage.getItem(seenKey(n.id))) done[n.id] = true } catch {} }
    setSeen(done)
  }, [notices])

  const refresh = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return
    lastFetch.current = Date.now()
    try {
      const response = await fetchRead('/api/admin/notices', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) return
      const data = await response.json().catch(() => null)
      if (Array.isArray(data?.notices)) setNotices(data.notices)
    } catch {
      // Offline or a hiccup: the notices already shown stay.
    }
  }, [])

  // A new page: ask again.
  useEffect(() => { refresh() }, [pathname, refresh])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, EVERY_MS)
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'team-notice') refresh(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [refresh])

  // The Team notices page lists them itself, with Remove buttons.
  if (!seen || pathname.startsWith('/admin/notices')) return null
  const visible = notices.filter(n => !seen[n.id])
  if (!visible.length) return null
  const dismiss = (id: string) => {
    try { window.localStorage.setItem(seenKey(id), '1') } catch {}
    setSeen(current => ({ ...(current || {}), [id]: true }))
  }
  return <section className={s.board} aria-label="Team notices">
    {visible.map(n => <div key={n.id} className={s.notice} role="group" aria-label={`Notice from ${n.authorName}`}>
      <Megaphone size={18} aria-hidden="true" className={s.icon} />
      <div className={s.body}>
        <p className={s.text}>{n.text}</p>
        <span className={s.meta}>{n.authorName} · {n.age}</span>
      </div>
      <button type="button" className={s.gotIt} onClick={() => dismiss(n.id)}><X size={15} aria-hidden="true" />Got it</button>
    </div>)}
  </section>
}
