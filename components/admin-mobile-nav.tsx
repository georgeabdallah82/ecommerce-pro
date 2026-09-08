'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, Store, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import AdminSidebar, { type AdminSidebarGroup } from '@/components/admin-sidebar'

export default function AdminMobileNav({ groups, role }: { groups: AdminSidebarGroup[]; role?: string }) {
  const [open, setOpen] = useState(false)
  const [focusSearch, setFocusSearch] = useState(false)
  const pathname = usePathname()

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
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    if (focusSearch) {
      const timer = window.setTimeout(() => document.getElementById('admin-nav-search-mobile')?.focus(), 120)
      setFocusSearch(false)
      return () => { window.clearTimeout(timer); document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
    }
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [open, focusSearch])

  return (
    <>
      <button type="button" className="adminMobileNavButton" aria-label="Open admin navigation" onClick={() => setOpen(true)}><Menu size={18} /></button>
      {open && (
        <div className="adminMobileNavOverlay" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="adminMobileNavBackdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="adminMobileNavDrawer">
            <div className="adminMobileNavHead"><div><strong>Control Center</strong><span>Store operations</span></div><button type="button" className="adminMobileNavClose" aria-label="Close admin navigation" onClick={() => setOpen(false)}><X size={18} /></button></div>
            {role && <div className="pill adminMobileNavRole">{role}</div>}
            <AdminSidebar groups={groups} />
            <div className="adminSideBottom adminMobileNavFoot">
              <Link href="/"><Store size={16} /> View storefront</Link>
              <form action="/api/auth/logout" method="post"><button className="sideButton" type="submit"><LogOut size={16} /> Sign out</button></form>
            </div>
          </aside>
        </div>
      )}
      <style jsx global>{`
        .adminMobileNavButton{display:none;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#222;cursor:pointer}
        .adminMobileNavOverlay{position:fixed;inset:0;z-index:1000;display:none}
        .adminMobileNavBackdrop{position:absolute;inset:0;border:0;background:rgba(8,10,9,.42);backdrop-filter:blur(2px)}
        .adminMobileNavDrawer{position:absolute;left:0;top:0;bottom:0;width:min(88vw,360px);padding:14px calc(14px + env(safe-area-inset-left)) calc(14px + env(safe-area-inset-bottom)) calc(14px + env(safe-area-inset-left));background:#fff;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;box-shadow:20px 0 60px rgba(0,0,0,.2)}
        .adminMobileNavDrawer .adminNavTree{flex:1 1 auto}
        .adminMobileNavRole{align-self:flex-start;margin:12px 2px 4px}
        .adminMobileNavFoot{flex:0 0 auto;display:grid;gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid #e7e7e1}
        .adminMobileNavFoot a,.adminMobileNavFoot .sideButton{display:flex;align-items:center;gap:9px;width:100%;height:42px;padding:0 11px;border:0;border-radius:10px;background:transparent;color:#4f4f49;font:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer}
        .adminMobileNavFoot a:hover,.adminMobileNavFoot .sideButton:hover{background:#f4f4f0;color:#171717}
        html[data-admin-theme='dark'] .adminMobileNavFoot{border-top-color:#2b322e}
        html[data-admin-theme='dark'] .adminMobileNavFoot a,html[data-admin-theme='dark'] .adminMobileNavFoot .sideButton{color:#b6bdb7}
        html[data-admin-theme='dark'] .adminMobileNavFoot a:hover,html[data-admin-theme='dark'] .adminMobileNavFoot .sideButton:hover{background:#202521;color:#f2f5f3}
        .adminMobileNavHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 14px;border-bottom:1px solid #e7e7e1}.adminMobileNavHead div{display:grid;gap:2px}.adminMobileNavHead strong{font-size:14px}.adminMobileNavHead span{font-size:11px;color:#777}
        .adminMobileNavClose{display:grid;place-items:center;width:36px;height:36px;border:1px solid #deded8;border-radius:10px;background:#fff;cursor:pointer}.adminMobileNavDrawer .adminNavTree{margin-top:14px}
        @media(max-width:760px){.adminMobileNavButton{display:inline-flex}.adminMobileNavOverlay{display:block}}
        html[data-admin-theme='dark'] .adminMobileNavButton{background:#1f2320;border-color:#343b36;color:#eef2ef}.adminMobileNavBackdrop{background:rgba(0,0,0,.42)}
        html[data-admin-theme='dark'] .adminMobileNavBackdrop{background:rgba(0,0,0,.62)}
        html[data-admin-theme='dark'] .adminMobileNavDrawer{background:#171918;color:#f2f4f2;border-color:#292d2a}.adminMobileNavHead{color:inherit}.adminMobileNavHead span{color:#9ca59f}.adminMobileNavClose{color:inherit}
        html[data-admin-theme='dark'] .adminMobileNavClose{background:#1f2320;border-color:#343b36;color:#eef2ef}
      `}</style>
    </>
  )
}
