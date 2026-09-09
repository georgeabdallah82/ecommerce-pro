'use client'

import { useEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import AdminNavTree, { type AdminSidebarGroup } from '@/components/admin-nav-tree'

export type { AdminSidebarGroup, AdminSidebarItem } from '@/components/admin-nav-tree'

/*
 * This component owns only the desktop collapse/expand mechanic (the floating
 * toggle, the icon-only rail, the expand/collapse height animation). Design
 * tokens, the shell grid, .adminSide's own box (position/size/background), the
 * brand mark and the shared .adminNav* look all live in ../app/admin/admin-overhaul.css.
 * The tree itself - search, groups, items - lives in ./admin-nav-tree.tsx and is
 * shared byte-for-byte with the mobile drawer, so the two surfaces can no longer
 * drift to different pixel values for the same classes.
 */
const css = `
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminShell{grid-template-columns:78px minmax(0,1fr)!important}
@media(min-width:761px){body:has(.adminShell) .adminSide{display:flex!important}}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminSide{padding-left:9px!important;padding-right:9px!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminBrand{justify-content:center!important;padding:0!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminBrand>div:last-child{display:none!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminSide>.pill{display:none!important}

.adminSidebarDrawer{position:relative;display:flex;min-height:0;flex:1 1 auto}
.adminSidebarToggle{appearance:none;width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid #e2e2dc;border-radius:10px;background:rgba(255,255,255,.94);color:#5f615b;cursor:pointer;box-shadow:0 2px 8px rgba(20,20,18,.05);transition:all .16s ease}
.adminSidebarToggle:hover{background:#f2f2ef;color:#171817;border-color:#cecec7;transform:translateY(-1px)}
.adminSidebarToggle:focus-visible{outline:3px solid rgba(0,128,96,.14);outline-offset:2px}
.adminSidebarToggleFloating{position:absolute;top:-1px;right:0;z-index:10}
.adminSidebarDrawer.isCollapsed .adminSidebarToggleFloating{right:50%;transform:translateX(50%)}
.adminSidebarDrawer.isCollapsed .adminSidebarToggleFloating:hover{transform:translateX(50%) translateY(-1px)}

.adminSidebarNav{width:100%;height:100%;display:flex;flex-direction:column;min-height:0}
body:has(.adminShell) .adminSide>.adminSidebarDrawer .adminSidebarNav{padding-top:50px}
.adminSidebarScroll{min-height:0;flex:1 1 auto;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;padding:0 0 6px}
.adminSidebarScroll::-webkit-scrollbar{width:0;height:0}

.adminSidebarDrawer.isCollapsed .adminNavSearchWrap{width:46px;height:42px;margin-left:auto;margin-right:auto;justify-content:center;padding:0;cursor:pointer}
.adminSidebarDrawer.isCollapsed .adminNavSearchWrap input,.adminSidebarDrawer.isCollapsed .adminNavSearchWrap kbd{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavSearchWrap svg{width:17px;height:17px}

.adminNavGroup{display:grid;gap:2px;margin-bottom:3px}
.adminNavChevron{flex:none;opacity:.55;transition:transform .17s ease}.adminNavChevron.open{transform:rotate(180deg)}
.adminNavGroupButton>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adminNavChildren{display:grid;grid-template-rows:0fr;overflow:hidden;transition:grid-template-rows .18s cubic-bezier(.2,.7,.3,1)}
.adminNavChildren.open{grid-template-rows:1fr}
.adminNavChildren>*{min-height:0}
.adminNavItem svg{flex:0 0 17px;opacity:.72}.adminNavItem span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adminNavItem.active svg{opacity:1}
.adminSidebarDrawer.isCollapsed .adminNavGroupButton{height:10px;padding:0;margin:4px 11px;background:transparent;border-top:1px solid var(--admin-border-soft);border-radius:0;pointer-events:none}
.adminSidebarDrawer.isCollapsed .adminNavGroupButton>span,.adminSidebarDrawer.isCollapsed .adminNavChevron{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavItem{justify-content:center!important;width:46px!important;margin:2px auto!important;padding:0!important;gap:0!important}
.adminSidebarDrawer.isCollapsed .adminNavItem span{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavItem svg{opacity:.8}
.adminNavEmpty{margin:0 1px}
.adminSidebarDrawer.isCollapsed .adminNavTheme{display:none!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminSideBottom{display:none!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminMain{padding-left:32px!important}

html[data-admin-theme='dark'] .adminSidebarToggle{background:#1c211e;border-color:#343a35;color:#b5beb8}
html[data-admin-theme='dark'] .adminSidebarToggle:hover{background:#252b27;color:#fff;border-color:#424a44}
@media(max-width:760px){.adminSidebarDrawer{display:none!important}}
`

export default function AdminSidebarDrawer({ groups }: { groups: AdminSidebarGroup[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem('admin.sidebar.collapsed') === '1') } catch {}
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem('admin.sidebar.collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault(); setCollapsed(value => !value)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCollapsed(false); window.setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`adminSidebarDrawer${collapsed ? ' isCollapsed' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <button
        type="button"
        className="adminSidebarToggle adminSidebarToggleFloating"
        onClick={() => setCollapsed(value => !value)}
        aria-label={collapsed ? 'Open admin sidebar' : 'Collapse admin sidebar'}
        title={collapsed ? 'Open sidebar (Ctrl/Cmd+B)' : 'Collapse sidebar (Ctrl/Cmd+B)'}
      >
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>
      <div className="adminSidebarNav">
        <div className="adminSidebarScroll">
          <AdminNavTree groups={groups} collapsed={collapsed} onRequestExpand={() => setCollapsed(false)} searchInputRef={searchRef} />
        </div>
      </div>
    </div>
  )
}
