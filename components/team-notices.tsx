'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Megaphone, X } from 'lucide-react'
import s from './team-notices.module.css'

// The team notice board at the top of every admin page (lib/team-notices.ts). "Got it" hides a notice on
// this device only; it comes back on other devices until they tap it too, or until it expires.

export type ShownNotice = { id: string; text: string; authorName: string; age: string }
const seenKey = (id: string) => `yh_notice_seen_${id}`

export default function TeamNotices({ notices }: { notices: ShownNotice[] }) {
  // Nothing is drawn until the device's own "Got it" list has been read, so a notice already
  // dismissed here never flashes on screen.
  const pathname = usePathname()
  const [seen, setSeen] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    const done: Record<string, boolean> = {}
    for (const n of notices) { try { if (window.localStorage.getItem(seenKey(n.id))) done[n.id] = true } catch {} }
    setSeen(done)
  }, [notices])
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
