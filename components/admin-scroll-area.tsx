'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import ui from './admin-ui.module.css'
import s from './admin-content-editors.module.css'

// A table that is wider than the screen (on a phone) scrolls sideways inside its card. While it does, the scroll
// area is a named region in the Tab order, so it can be scrolled with the arrow keys; when it fits, it is neither
// (no extra Tab stop on wider screens).
export default function AdminScrollArea({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`${ui.tableWrap} ${s.tableRegion}`} role={scrolls ? 'region' : undefined} aria-label={scrolls ? label : undefined} tabIndex={scrolls ? 0 : undefined}>{children}</div>
}
