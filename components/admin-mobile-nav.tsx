'use client'

import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import AdminSidebar, { type AdminSidebarGroup } from '@/components/admin-sidebar'

export default function AdminMobileNav({ groups }: { groups: AdminSidebarGroup[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <>
      <button type="button" className="adminMobileNavButton" aria-label="Open admin navigation" onClick={() => setOpen(true)}>
        <Menu size={18} />
      </button>
      {open && (
        <div className="adminMobileNavOverlay" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="adminMobileNavBackdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="adminMobileNavDrawer">
            <div className="adminMobileNavHead">
              <div><strong>Control Center</strong><span>Store operations</span></div>
              <button type="button" className="adminMobileNavClose" aria-label="Close admin navigation" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <AdminSidebar groups={groups} />
          </aside>
        </div>
      )}
      <style jsx global>{`
        .adminMobileNavButton{display:none;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#222;cursor:pointer}
        .adminMobileNavOverlay{position:fixed;inset:0;z-index:1000;display:none}
        .adminMobileNavBackdrop{position:absolute;inset:0;border:0;background:rgba(8,10,9,.42);backdrop-filter:blur(2px)}
        .adminMobileNavDrawer{position:absolute;left:0;top:0;bottom:0;width:min(88vw,360px);padding:14px;background:#fff;overflow:auto;box-shadow:20px 0 60px rgba(0,0,0,.2)}
        .adminMobileNavHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 14px;border-bottom:1px solid #e7e7e1}
        .adminMobileNavHead div{display:grid;gap:2px}.adminMobileNavHead strong{font-size:14px}.adminMobileNavHead span{font-size:11px;color:#777}
        .adminMobileNavClose{display:grid;place-items:center;width:36px;height:36px;border:1px solid #deded8;border-radius:10px;background:#fff;cursor:pointer}
        .adminMobileNavDrawer .adminNavTree{margin-top:14px}
        @media(max-width:760px){.adminMobileNavButton{display:inline-flex}.adminMobileNavOverlay{display:block}}
        html[data-admin-theme='dark'] .adminMobileNavButton{background:#1f2320;border-color:#343b36;color:#eef2ef}
        html[data-admin-theme='dark'] .adminMobileNavBackdrop{background:rgba(0,0,0,.58)}
        html[data-admin-theme='dark'] .adminMobileNavDrawer{background:#171918;color:#f2f4f2;border-color:#292d2a}
        html[data-admin-theme='dark'] .adminMobileNavHead{border-color:#292d2a}
        html[data-admin-theme='dark'] .adminMobileNavHead span{color:#9ca59f}
        html[data-admin-theme='dark'] .adminMobileNavClose{background:#1f2320;border-color:#343b36;color:#eef2ef}
      `}</style>
    </>
  )
}
