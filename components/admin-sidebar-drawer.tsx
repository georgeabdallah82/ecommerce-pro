'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Boxes, ChevronDown, FileText, FolderTree, Image as ImageIcon, Layers3,
  LayoutDashboard, Menu, MessageSquare, PackageCheck, Palette, PanelLeftClose, PanelLeftOpen,
  Search, Settings2, ShoppingBag, Tag, Truck, UserCog, Users, Workflow, type LucideIcon,
} from 'lucide-react'
import AdminThemeToggle from '@/components/admin-theme-toggle'

export type AdminSidebarItem = { href: string; label: string; permission: any; icon: string }
export type AdminSidebarGroup = { id: string; label: string; items: AdminSidebarItem[] }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingBag,
  products: Boxes,
  inventory: PackageCheck,
  operations: Workflow,
  customers: Users,
  categories: FolderTree,
  collections: Layers3,
  discounts: Tag,
  reviews: MessageSquare,
  shipping: Truck,
  store: ShoppingBag,
  theme: Palette,
  navigation: Menu,
  content: FileText,
  files: ImageIcon,
  analytics: BarChart3,
  system: Activity,
  users: UserCog,
  activity: Activity,
  settings: Settings2,
}

/*
 * This component owns only the collapse/expand mechanic (the floating toggle, the
 * icon-only rail, the expand/collapse height animation). Design tokens, the shell
 * grid, .adminSide's own box (position/size/background), the brand mark and the
 * shared .adminNav* look all live in ../app/admin/admin-overhaul.css - keep them
 * there so this file and admin-sidebar.tsx (the mobile drawer's nav) can't drift
 * out of sync with different pixel values for the same classes.
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

function normalizePath(pathname: string) { return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname }
function isActivePath(pathname: string, href: string) { const current = normalizePath(pathname); const target = normalizePath(href); return target === '/admin' ? current === '/admin' : current === target || current.startsWith(`${target}/`) }

export default function AdminSidebarDrawer({ groups }: { groups: AdminSidebarGroup[] }) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(group => [group.id, true])))
  const activeGroups = useMemo(() => new Set(groups.filter(group => group.items.some(item => isActivePath(pathname, item.href))).map(group => group.id)), [groups, pathname])

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('admin.sidebar.collapsed') === '1')
      const stored = window.localStorage.getItem('admin.sidebar.open-groups')
      if (stored) setOpenGroups(current => ({ ...current, ...(JSON.parse(stored) as Record<string, boolean>) }))
    } catch {}
  }, [])

  useEffect(() => {
    setOpenGroups(current => {
      const next = { ...current }
      activeGroups.forEach(id => { next[id] = true })
      return next
    })
  }, [activeGroups])

  useEffect(() => {
    try { window.localStorage.setItem('admin.sidebar.collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  useEffect(() => {
    try { window.localStorage.setItem('admin.sidebar.open-groups', JSON.stringify(openGroups)) } catch {}
  }, [openGroups])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault(); setCollapsed(value => !value)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCollapsed(false); window.setTimeout(() => document.getElementById('admin-nav-search')?.focus(), 0)
      }
      if (event.key === 'Escape' && document.activeElement?.id === 'admin-nav-search') {
        setQuery(''); (document.activeElement as HTMLElement).blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleGroups = useMemo(() => groups.map(group => ({ ...group, items: group.items.filter(item => !normalizedQuery || `${group.label} ${item.label}`.toLowerCase().includes(normalizedQuery)) })).filter(group => group.items.length), [groups, normalizedQuery])

  return (
    <div className={`adminSidebarDrawer${collapsed ? ' isCollapsed' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <button type="button" className="adminSidebarToggle adminSidebarToggleFloating" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Open admin sidebar' : 'Collapse admin sidebar'} title={collapsed ? 'Open sidebar (Ctrl/Cmd+B)' : 'Collapse sidebar (Ctrl/Cmd+B)'}>
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>
      <nav className="adminSidebarNav" aria-label="Admin navigation">
        <div className="adminSidebarScroll">
          <div className="adminNavSearchWrap" role={collapsed ? 'button' : undefined} tabIndex={collapsed ? 0 : undefined} onClick={collapsed ? () => setCollapsed(false) : undefined} onKeyDown={collapsed ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCollapsed(false) } } : undefined} title={collapsed ? 'Open sidebar search' : undefined}>
            <Search size={16} aria-hidden="true" />
            <input id="admin-nav-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search admin…" aria-label="Search admin navigation" />
            <kbd>⌘K</kbd>
          </div>
          {normalizedQuery && !collapsed && <div className="adminNavSearchMeta">{visibleGroups.reduce((count, group) => count + group.items.length, 0)} matches</div>}
          {visibleGroups.map(group => {
            const groupActive = activeGroups.has(group.id)
            const open = collapsed ? true : (normalizedQuery ? true : (openGroups[group.id] ?? true))
            const panelId = `admin-nav-${group.id}-items`
            return (
              <div className={`adminNavGroup${groupActive ? ' active' : ''}`} key={group.id}>
                <button type="button" className={`adminNavGroupButton${groupActive ? ' active' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => { if (!collapsed) setOpenGroups(current => ({ ...current, [group.id]: !current[group.id] })) }} title={collapsed ? group.label : undefined}>
                  <span>{group.label}</span><ChevronDown className={`adminNavChevron${open ? ' open' : ''}`} size={14} aria-hidden="true" />
                </button>
                <div id={panelId} className={`adminNavChildren${open ? ' open' : ''}`} aria-hidden={!open}>
                  {group.items.map(item => {
                    const active = isActivePath(pathname, item.href)
                    const Icon = iconMap[item.icon] ?? Boxes
                    return <Link key={item.href} href={item.href} className={`adminNavItem${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>
                  })}
                </div>
              </div>
            )
          })}
          {!visibleGroups.length && <div className="adminNavEmpty">No admin pages match “{query}”.</div>}
          <div className="adminNavTheme"><AdminThemeToggle /></div>
        </div>
      </nav>
    </div>
  )
}
