'use client'

import { useEffect, useRef, type RefObject } from 'react'

// A modal dialog's keyboard rules, the ones the photo zoom already follows (components/photo-zoom.tsx), for the other
// storefront pop-ups: the welcome offer, a friend's invite and the quick view.
// - Focus moves in when it opens: to the element marked data-autofocus, else the first control.
// - Tab and Shift+Tab stay inside.
// - Escape closes it.
// - The page behind does not scroll.
// - When it closes, focus goes back to what had it (the button that opened it).
// - A dialog opened on top of it handles its own keys.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]'))
    ;(dialog.querySelector<HTMLElement>('[data-autofocus]') || controls()[0] || dialog).focus()
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened on top of this one (the admin's password check before a refund, a "sure?"
      // question) keeps its own keys: Escape closes only it, and Tab stays in it.
      const inside = e.target instanceof Element ? e.target.closest('[role="dialog"], [role="alertdialog"]') : null
      if (inside && inside !== dialog && !dialog.contains(inside)) return
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab') return
      const list = controls()
      if (!list.length) { e.preventDefault(); return }
      const at = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && at <= 0) { e.preventDefault(); list[list.length - 1].focus() }
      else if (!e.shiftKey && (at === -1 || at === list.length - 1)) { e.preventDefault(); list[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root.style.overflow = overflow
      if (opener && opener.isConnected && opener !== document.body) opener.focus()
    }
  }, [open, ref])
}
