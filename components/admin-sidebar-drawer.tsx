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

const css = `
body:has(.adminShell){background:var(--admin-bg)!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminShell{grid-template-columns:78px minmax(0,1fr)!important}
body:has(.adminShell) .adminSide{position:sticky!important;top:0!important;height:100vh!important;min-height:100vh!important;flex-direction:column!important;overflow:hidden!important;padding:14px 10px!important;background:var(--admin-surface)!important;border-right:1px solid var(--admin-border)!important;box-shadow:var(--admin-shadow-sm)!important;z-index:60!important;transition:padding .22s ease,background .22s ease}
@media(min-width:761px){body:has(.adminShell) .adminSide{display:flex!important}}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminSide{padding-left:9px!important;padding-right:9px!important}
body:has(.adminShell) .adminSide>.adminBrand{flex:0 0 auto!important;margin:0!important;padding:0 3px!important;min-height:44px!important;display:flex!important;align-items:center!important;gap:10px!important;overflow:hidden!important;white-space:nowrap!important}
body:has(.adminShell) .adminBrandMark{flex:0 0 40px!important;width:40px!important;height:40px!important;border-radius:12px!important;display:grid!important;place-items:center!important;background:var(--admin-accent)!important;color:var(--admin-accent-ink)!important;box-shadow:0 6px 18px rgba(31,122,82,.25)!important}
body:has(.adminShell) .adminBrand .logo{font-size:15px!important;font-weight:900!important;letter-spacing:-.025em!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminBrand{justify-content:center!important;padding:0!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminBrand>div:last-child{display:none!important}
body:has(.adminShell) .adminSide>.pill{flex:0 0 auto!important;align-self:flex-start!important;margin:0 3px!important}
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

.adminNavSearchWrap{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:9px;height:42px;margin:0 1px 12px;padding:0 10px;border:1px solid #dfdfd9;border-radius:11px;background:#fafaf8;color:#73766f;box-shadow:0 2px 6px rgba(20,20,18,.025);transition:all .16s ease}
.adminNavSearchWrap:focus-within{background:#fff;border-color:#bdbdb5;box-shadow:0 0 0 3px rgba(20,20,18,.045)}
.adminNavSearchWrap input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#181917;font-size:12px;font-weight:650}
.adminNavSearchWrap input::placeholder{color:#999b95}
.adminNavSearchWrap kbd{border:1px solid #dddcd6;border-radius:6px;background:#fff;color:#8b8d86;font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 5px;white-space:nowrap}
.adminSidebarDrawer.isCollapsed .adminNavSearchWrap{width:46px;height:42px;margin-left:auto;margin-right:auto;justify-content:center;padding:0;cursor:pointer}
.adminSidebarDrawer.isCollapsed .adminNavSearchWrap input,.adminSidebarDrawer.isCollapsed .adminNavSearchWrap kbd{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavSearchWrap svg{width:17px;height:17px}

.adminNavGroup{display:grid;gap:2px;margin-bottom:3px}
.adminNavGroupButton{appearance:none;width:100%;height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:#898b84;font:800 10px/1 inherit;letter-spacing:.09em;text-transform:uppercase;text-align:left;cursor:pointer;transition:background .14s ease,color .14s ease}
.adminNavGroupButton:hover{background:#f4f4f1;color:#4c4e48}
.adminNavGroupButton.active{color:#282a26}
.adminNavGroupButton:focus-visible{outline:3px solid rgba(0,128,96,.14);outline-offset:2px}
.adminNavChevron{flex:none;opacity:.55;transition:transform .17s ease}.adminNavChevron.open{transform:rotate(180deg)}
.adminNavGroupButton>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adminNavChildren{display:grid;grid-template-rows:0fr;overflow:hidden;transition:grid-template-rows .18s cubic-bezier(.2,.7,.3,1)}
.adminNavChildren.open{grid-template-rows:1fr}
.adminNavChildren>*{min-height:0}
.adminNavItem{min-width:0;height:40px!important;margin:2px 1px!important;padding:0 10px!important;display:flex!important;align-items:center!important;gap:11px!important;border-radius:10px!important;color:var(--admin-ink-soft)!important;font-size:13px!important;font-weight:650!important;text-decoration:none!important;transition:background .14s ease,color .14s ease,box-shadow .14s ease!important}
.adminNavItem svg{flex:0 0 17px;opacity:.72}.adminNavItem span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adminNavItem:hover{background:var(--admin-border-soft)!important;color:var(--admin-ink)!important;transform:none!important}
.adminNavItem.active{background:var(--admin-accent)!important;color:var(--admin-accent-ink)!important;box-shadow:0 5px 14px rgba(31,122,82,.28)!important}
.adminNavItem.active svg{opacity:1}
.adminNavItem:focus-visible{outline:3px solid rgba(0,128,96,.14);outline-offset:2px}
.adminSidebarDrawer.isCollapsed .adminNavGroupButton{height:10px;padding:0;margin:4px 11px;background:transparent;border-top:1px solid #ecece7;border-radius:0;pointer-events:none}
.adminSidebarDrawer.isCollapsed .adminNavGroupButton>span,.adminSidebarDrawer.isCollapsed .adminNavChevron{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavItem{justify-content:center!important;width:46px!important;margin:2px auto!important;padding:0!important;gap:0!important}
.adminSidebarDrawer.isCollapsed .adminNavItem span{display:none!important}
.adminSidebarDrawer.isCollapsed .adminNavItem svg{opacity:.8}
.adminNavSearchMeta{padding:0 10px 7px;font-size:10px;color:#8d8f89;text-transform:uppercase;letter-spacing:.07em;font-weight:800}
.adminNavEmpty{margin:0 1px;padding:14px 9px;border:1px dashed #dddcd5;border-radius:10px;color:#8b8d86;font-size:12px;line-height:1.5;text-align:center;background:#fbfbf9}
.adminNavTheme{margin-top:8px;padding:8px 1px 0;border-top:1px solid #ededeb}
.adminSidebarDrawer.isCollapsed .adminNavTheme{display:none!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminSideBottom{display:none!important}
body:has(.adminShell) .adminSideBottom{flex:0 0 auto!important;margin:0!important;padding:9px 0 0!important;border-top:1px solid var(--admin-border-soft)!important}
body:has(.adminShell) .adminSideBottom a,body:has(.adminShell) .adminSideBottom .sideButton{width:100%!important;height:40px!important;border-radius:10px!important;padding:0 10px!important;justify-content:flex-start!important}
body:has(.adminShell .adminSidebarDrawer.isCollapsed) .adminMain{padding-left:32px!important}

html[data-admin-theme='dark'] .adminNavSearchWrap{background:#1b201d;border-color:#303732;color:#aab3ad}
html[data-admin-theme='dark'] .adminNavSearchWrap input{color:#eef2ef}
html[data-admin-theme='dark'] .adminNavSearchWrap kbd{background:#232a26;border-color:#343b36;color:#a7b0aa}
html[data-admin-theme='dark'] .adminNavGroupButton{color:#929b95}
html[data-admin-theme='dark'] .adminNavGroupButton:hover{background:#202622;color:#eef2ef}
html[data-admin-theme='dark'] .adminSidebarToggle{background:#1c211e;border-color:#343a35;color:#b5beb8}
html[data-admin-theme='dark'] .adminSidebarToggle:hover{background:#252b27;color:#fff;border-color:#424a44}
html[data-admin-theme='dark'] .adminNavTheme,html[data-admin-theme='dark'] body:has(.adminShell) .adminSideBottom{border-color:#2b322e!important}
@media(max-width:760px){body:has(.adminShell) .adminShell{grid-template-columns:1fr!important}.adminSidebarDrawer{display:none!important}body:has(.adminShell) .adminSide{display:none!important}}
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
