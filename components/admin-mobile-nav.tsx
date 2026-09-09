'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, Store, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AdminNavTree, { type AdminSidebarGroup } from '@/components/admin-nav-tree'

export default function AdminMobileNav({ groups, role }: { groups: AdminSidebarGroup[]; role?: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [focusSearch, setFocusSearch] = useState(false)
  const pathname = usePathname()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Portals need a document to render into, which only exists after mount -
  // rendering one during SSR would be a no-op that also risks a hydration mismatch.
  useEffect(() => { setMounted(true) }, [])

  // The drawer lives in the admin layout, which App Router keeps mounted across
  // client navigations - without this it stays open on top of the page you just
  // navigated to.
  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    const onSearchRequest = () => { setFocusSearch(true); setOpen(true) }
    window.addEventListener('admin-mobile-search', onSearchRequest)
    return () => window.removeEventListener('admin-mobile-search', onSearchRequest)
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog on open, and trap Tab/Shift+Tab inside it while it's
    // open - without this, keyboard and screen-reader users can tab straight through
    // into the page behind an overlay that's supposedly modal.
    const focusTarget = focusSearch ? searchRef.current : closeRef.current
    const timer = window.setTimeout(() => focusTarget?.focus(), focusSearch ? 120 : 0)
    if (focusSearch) setFocusSearch(false)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
      // Give the close button back to whoever opened the drawer, mid-page or top bar alike.
      triggerRef.current?.focus()
    }
  }, [open, focusSearch])

  const drawer = open && (
    <div className="adminMobileNavOverlay" role="dialog" aria-modal="true" aria-label="Admin navigation">
      <button type="button" className="adminMobileNavBackdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
      <div className="adminMobileNavDrawer" ref={drawerRef}>
        <div className="adminMobileNavHead">
          <div><strong>Control Center</strong><span>Store operations</span></div>
          <button type="button" className="adminMobileNavClose" aria-label="Close admin navigation" onClick={() => setOpen(false)} ref={closeRef}><X size={18} /></button>
        </div>
        {role && <div className="pill adminMobileNavRole">{role}</div>}
        <div className="adminMobileNavScroll">
          <AdminNavTree groups={groups} onNavigate={() => setOpen(false)} searchInputRef={searchRef} showThemeToggle />
        </div>
        <div className="adminSideBottom adminMobileNavFoot">
          <Link href="/" onClick={() => setOpen(false)}><Store size={16} /> View storefront</Link>
          <form action="/api/auth/logout" method="post"><button className="sideButton" type="submit"><LogOut size={16} /> Sign out</button></form>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button type="button" className="adminMobileNavButton" aria-label="Open admin navigation" onClick={() => setOpen(true)} ref={triggerRef}><Menu size={18} /></button>
      {/*
        Rendered via a portal straight into <body>, not inline here. This button's
        ancestor is <header class="adminWorkspaceTopbar">, which has backdrop-filter
        for its glass effect - and backdrop-filter (like filter/transform) creates a
        new containing block for position:fixed descendants. A fixed-position overlay
        left inside that header doesn't cover the viewport, it gets trapped inside the
        header's own ~70px box, which is why the drawer used to render squashed at the
        top with the actual page showing through underneath it. Escaping to <body> via
        a portal is the standard fix and the only way position:fixed reliably means
        "cover the viewport" here.
      */}
      {mounted && drawer && createPortal(drawer, document.body)}
      <style jsx global>{`
        .adminMobileNavButton{display:none;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#222;cursor:pointer}
        .adminMobileNavOverlay{position:fixed;inset:0;z-index:2000;display:none}
        .adminMobileNavBackdrop{position:absolute;inset:0;border:0;background:rgba(8,10,9,.42);backdrop-filter:blur(2px)}
        .adminMobileNavDrawer{position:absolute;left:0;top:0;bottom:0;width:min(88vw,360px);padding:14px calc(14px + env(safe-area-inset-left)) calc(14px + env(safe-area-inset-bottom)) calc(14px + env(safe-area-inset-left));background:#fff;overflow:hidden;display:flex;flex-direction:column;box-shadow:20px 0 60px rgba(0,0,0,.2)}
        .adminMobileNavScroll{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;margin-top:14px}
        .adminMobileNavScroll .adminNavTree{height:100%}
        .adminMobileNavRole{align-self:flex-start;margin:12px 2px 4px}
        .adminMobileNavFoot{flex:0 0 auto;display:grid;gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid #e7e7e1}
        .adminMobileNavFoot a,.adminMobileNavFoot .sideButton{display:flex;align-items:center;gap:9px;width:100%;height:42px;padding:0 11px;border:0;border-radius:10px;background:transparent;color:#4f4f49;font:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer}
        .adminMobileNavFoot a:hover,.adminMobileNavFoot .sideButton:hover{background:#f4f4f0;color:#171717}
        html[data-admin-theme='dark'] .adminMobileNavFoot{border-top-color:#2b322e}
        html[data-admin-theme='dark'] .adminMobileNavFoot a,html[data-admin-theme='dark'] .adminMobileNavFoot .sideButton{color:#b6bdb7}
        html[data-admin-theme='dark'] .adminMobileNavFoot a:hover,html[data-admin-theme='dark'] .adminMobileNavFoot .sideButton:hover{background:#202521;color:#f2f5f3}
        .adminMobileNavHead{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 14px;border-bottom:1px solid #e7e7e1}
        .adminMobileNavHead div{display:grid;gap:2px}.adminMobileNavHead strong{font-size:14px}.adminMobileNavHead span{font-size:11px;color:#777}
        .adminMobileNavClose{display:grid;place-items:center;width:36px;height:36px;border:1px solid #deded8;border-radius:10px;background:#fff;cursor:pointer}
        @media(max-width:760px){.adminMobileNavButton{display:inline-flex}.adminMobileNavOverlay{display:block}}
        html[data-admin-theme='dark'] .adminMobileNavButton{background:#1f2320;border-color:#343b36;color:#eef2ef}
        html[data-admin-theme='dark'] .adminMobileNavBackdrop{background:rgba(0,0,0,.62)}
        html[data-admin-theme='dark'] .adminMobileNavDrawer{background:#171918;color:#f2f4f2;border-color:#292d2a}
        html[data-admin-theme='dark'] .adminMobileNavHead{color:inherit}html[data-admin-theme='dark'] .adminMobileNavHead span{color:#9ca59f}
        html[data-admin-theme='dark'] .adminMobileNavClose{background:#1f2320;border-color:#343b36;color:#eef2ef}
      `}</style>
    </>
  )
}
