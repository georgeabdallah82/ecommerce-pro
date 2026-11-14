'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// A "More" button and its menu (Admin > Orders: the list's menus and the order page's). The menus were opened by
// a button but couldn't be used from the keyboard: focus stayed on the button, the arrow keys did nothing, and
// Escape left focus where it was (docs/admin-orders-2026-11.md).
// - Opening it (click, Enter, Space or ArrowDown) moves focus to its first item.
// - ArrowDown and ArrowUp move through the items (round the end), Home and End go to the first and last.
// - Escape closes it and puts focus back on the button; Tab closes it and moves on; a click outside closes it.
// - Choosing an item closes it, with focus on the button (where a dialog opened from the item returns it).
// Items are the links and buttons inside, each with role="menuitem". `badge` sits beside the button, outside its
// name (the button's name says what the number means).
export default function AdminMenu({ label, content, children, className, buttonClassName, menuClassName, badge }: {
  label?: string
  content: ReactNode
  children: ReactNode
  className?: string
  buttonClassName?: string
  menuClassName?: string
  badge?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])]

  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    const close = (event: Event) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.target === button.current && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
      return
    }
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus() }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus() }
    else if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(list.length - 1)
    else if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className={className} ref={wrap} onKeyDown={onKeyDown}>
      <button ref={button} type="button" className={buttonClassName} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>{content}</button>
      {badge}
      {/* Choosing an item puts focus back on the button first, so a dialog the item opens returns focus there. */}
      {open && <div ref={menu} className={menuClassName} role="menu" aria-label={label} onClick={() => { button.current?.focus(); setOpen(false) }}>{children}</div>}
    </div>
  )
}
