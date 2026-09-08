'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Boxes, ChevronDown, FileText, FolderTree, Image as ImageIcon, Layers3,
  LayoutDashboard, Menu, MessageSquare, PackageCheck, Palette, Search, Settings2, ShoppingBag,
  Tag, Truck, UserCog, Users, Workflow, type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'
import AdminThemeToggle from '@/components/admin-theme-toggle'

export type AdminSidebarItem = { href: string; label: string; permission: Permission; icon: string }
export type AdminSidebarGroup = { id: string; label: string; items: AdminSidebarItem[] }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, orders: ShoppingBag, products: Boxes, inventory: PackageCheck, operations: Workflow,
  customers: Users, categories: FolderTree, collections: Layers3, discounts: Tag, reviews: MessageSquare,
  shipping: Truck, store: ShoppingBag, theme: Palette, navigation: Menu, content: FileText, files: ImageIcon,
  analytics: BarChart3, system: Activity, users: UserCog, activity: Activity, settings: Settings2,
}

const css = `
.adminNavSearchWrap{display:flex;align-items:center;gap:8px;height:38px;padding:0 9px;margin:0 0 8px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-border-soft);color:var(--admin-muted)}
.adminNavSearchWrap:focus-within{border-color:var(--admin-accent);background:var(--admin-surface);box-shadow:0 0 0 3px var(--admin-focus)}
.adminNavSearchWrap input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--admin-ink);font-size:12px;font-weight:600}
.adminNavSearchWrap input::placeholder{color:var(--admin-muted-soft)}
.adminNavSearchWrap kbd{border:1px solid var(--admin-border);border-radius:6px;background:var(--admin-surface);color:var(--admin-muted);font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 5px;white-space:nowrap}
.adminNavSearchMeta{padding:0 10px 7px;font-size:10px;color:var(--admin-muted-soft);text-transform:uppercase;letter-spacing:.07em;font-weight:800}
.adminNavActiveDot{display:none!important}
.adminNavEmpty{padding:14px 10px;border:1px dashed var(--admin-border);border-radius:10px;color:var(--admin-muted);font-size:12px;line-height:1.5;text-align:center;background:var(--admin-border-soft)}
.adminNavTree,.adminNavGroup,.adminNavChildren{overflow-anchor:none}
.adminNavGroupButton{appearance:none;-webkit-appearance:none;transition:background .16s ease,color .16s ease}
.adminNavGroupButton:focus-visible{outline:3px solid var(--admin-focus);outline-offset:2px}
.adminNavItem{transform:none!important;transition:background .16s ease,color .16s ease,box-shadow .16s ease}
.adminNavItem:hover{transform:none!important}
body:has(.adminShell) .adminSide nav a.adminNavItem:hover{transform:none!important}
body:has(.adminShell) .adminSide nav a.adminNavItem{will-change:auto!important}

/* Unified admin design system */
body:has(.adminShell){background:var(--admin-bg)!important;color:var(--admin-ink)}
body:has(.adminShell) .adminShell{grid-template-columns:248px minmax(0,1fr)!important;background:var(--admin-bg)!important}
body:has(.adminShell) .adminSide{background:var(--admin-surface)!important;border-right:1px solid var(--admin-border)!important;padding:16px 12px!important;box-shadow:var(--admin-shadow-sm)}
body:has(.adminShell) .adminMain{max-width:none!important;padding:0 34px 56px!important}
body:has(.adminShell) .adminTopbar{min-height:72px!important;margin:0 0 28px!important;background:var(--admin-topbar-bg)!important;border-bottom:1px solid var(--admin-border)!important;backdrop-filter:blur(18px)!important}
body:has(.adminShell) .adminTopbar > div:first-child{padding:10px 0!important}
body:has(.adminShell) .adminTopbar a{transition:all .15s ease}
body:has(.adminShell) .adminTopbar .btn{border-radius:11px!important}
body:has(.adminShell) .adminBrandMark{width:38px!important;height:38px!important;border-radius:12px!important;box-shadow:0 4px 12px rgba(0,128,96,.2)}
body:has(.adminShell) .adminBrand .logo{font-size:15px!important;font-weight:900!important}
body:has(.adminShell) .adminSide{scrollbar-width:thin;scrollbar-color:var(--admin-border) transparent}
body:has(.adminShell) .adminSide::-webkit-scrollbar{width:7px}
body:has(.adminShell) .adminSide::-webkit-scrollbar-thumb{background:var(--admin-border);border-radius:99px}

/* Navigation */
body:has(.adminShell) .adminNavTree{gap:4px}
body:has(.adminShell) .adminNavGroupButton{height:36px!important;border-radius:10px!important;padding:0 10px!important;color:var(--admin-muted)!important;font-size:11px!important;font-weight:800!important;letter-spacing:.065em!important;text-transform:uppercase}
body:has(.adminShell) .adminNavGroupButton:hover{background:var(--admin-border-soft)!important;color:var(--admin-ink-soft)!important}
body:has(.adminShell) .adminNavGroupButton.active{background:var(--admin-accent-soft)!important;color:var(--admin-accent-strong)!important}
body:has(.adminShell) .adminNavChildren{padding:1px 0 3px}
body:has(.adminShell) .adminNavItem{height:40px!important;margin:2px 0!important;padding:0 11px 0 27px!important;border-radius:10px!important;color:var(--admin-ink-soft)!important;font-size:13px!important;font-weight:650!important}
body:has(.adminShell) .adminNavItem svg{opacity:.76}
body:has(.adminShell) .adminNavItem:hover{background:var(--admin-border-soft)!important;color:var(--admin-ink)!important}
body:has(.adminShell) .adminNavItem.active{background:var(--admin-accent)!important;color:var(--admin-accent-ink)!important;box-shadow:0 5px 14px rgba(0,128,96,.28)!important}

/* Shared surfaces */
body:has(.adminShell) .card,
body:has(.adminShell) .editorCard,
body:has(.adminShell) .productTableCard,
body:has(.adminShell) .lv-side,
body:has(.adminShell) .lv-detail,
body:has(.adminShell) .lv-stat,
body:has(.adminShell) .opsCard,
body:has(.adminShell) .healthCheck,
body:has(.adminShell) .miniAlert,
body:has(.adminShell) .analyticsCard,
body:has(.adminShell) .settingsCard{border-color:var(--admin-border)!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .card:hover,
body:has(.adminShell) .editorCard:hover,
body:has(.adminShell) .opsCard:hover{box-shadow:var(--admin-shadow-md)!important}
body:has(.adminShell) .sectionHead{margin-bottom:24px!important}
body:has(.adminShell) .sectionHead .h2,
body:has(.adminShell) .catalogHead .h2{font-size:36px!important;line-height:1.05!important;letter-spacing:-.045em!important;color:var(--admin-ink)!important}
body:has(.adminShell) .sectionHead .muted{font-size:13px!important;line-height:1.55!important}
body:has(.adminShell) .tiny{font-size:10px!important;letter-spacing:.1em!important;font-weight:900!important;color:var(--admin-muted)!important}

/* Controls */
body:has(.adminShell) .btn{min-height:40px!important;border-radius:10px!important;padding:0 14px!important;font-size:13px!important;font-weight:800!important}
body:has(.adminShell) .btn.secondary{background:var(--admin-surface)!important;border-color:var(--admin-border)!important;color:var(--admin-ink-soft)!important}
body:has(.adminShell) .btn.ghost{background:transparent!important;border-color:var(--admin-border)!important;color:var(--admin-ink-soft)!important}
body:has(.adminShell) .iconBtn{border-color:var(--admin-border)!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .iconBtn:hover{background:var(--admin-border-soft)!important;border-color:var(--admin-border)!important}
body:has(.adminShell) .input,
body:has(.adminShell) .textarea,
body:has(.adminShell) select{border-color:var(--admin-border)!important;background:var(--admin-surface)!important;border-radius:10px!important;min-height:42px!important;color:var(--admin-ink)!important;font-size:13px!important}
body:has(.adminShell) .textarea{min-height:110px!important;padding-top:11px!important}
body:has(.adminShell) .input:focus,
body:has(.adminShell) .textarea:focus,
body:has(.adminShell) select:focus{border-color:var(--admin-accent)!important;box-shadow:0 0 0 3px var(--admin-focus)!important}
body:has(.adminShell) .fieldLabel{font-size:12px!important;font-weight:850!important;color:var(--admin-ink-soft)!important}
body:has(.adminShell) .fieldHelp{font-size:11px!important;line-height:1.55!important}
body:has(.adminShell) .alert{border-radius:12px!important;padding:12px 14px!important;font-size:12px!important}

/* Tables */
body:has(.adminShell) .table{background:var(--admin-surface)!important}
body:has(.adminShell) .table th{background:var(--admin-border-soft)!important;color:var(--admin-muted)!important;font-size:10px!important;letter-spacing:.075em!important;text-transform:uppercase!important;padding:11px 14px!important;border-bottom:1px solid var(--admin-border)!important}
body:has(.adminShell) .table td{padding:13px 14px!important;border-bottom:1px solid var(--admin-border-soft)!important;color:var(--admin-ink)!important;font-size:13px!important}
body:has(.adminShell) .table tbody tr{transition:background .12s ease}
body:has(.adminShell) .table tbody tr:hover{background:var(--admin-border-soft)!important}
body:has(.adminShell) .statusPill{font-size:10px!important;padding:5px 8px!important;border-radius:999px!important}
body:has(.adminShell) .statusPill.active{background:var(--admin-accent-soft)!important;color:var(--admin-accent-strong)!important}
body:has(.adminShell) .statusPill.draft{background:var(--admin-warning-soft)!important;color:var(--admin-warning)!important}
body:has(.adminShell) .statusPill.archived{background:var(--admin-border-soft)!important;color:var(--admin-muted)!important}
body:has(.adminShell) .tableTopline{background:var(--admin-surface)!important}
body:has(.adminShell) .catalogPagination{background:var(--admin-surface)!important}

/* Catalog / inventory */
body:has(.adminShell) .catalogPage,
body:has(.adminShell) .operationsPage,
body:has(.adminShell) .analyticsPage,
body:has(.adminShell) .settingsPro{max-width:1420px!important;margin:0 auto!important}
body:has(.adminShell) .catalogStats{gap:10px!important}
body:has(.adminShell) .statCard{border-color:var(--admin-border)!important;border-radius:15px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .statCard span{color:var(--admin-muted)!important;font-size:11px!important;font-weight:750!important}
body:has(.adminShell) .statCard strong{font-size:27px!important}
body:has(.adminShell) .catalogToolbar{border:1px solid var(--admin-border)!important;background:var(--admin-surface)!important;border-radius:15px!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .productSearch{background:var(--admin-border-soft)!important;border-color:var(--admin-border)!important}
body:has(.adminShell) .productSearch:focus-within{background:var(--admin-surface)!important;border-color:var(--admin-accent)!important;box-shadow:0 0 0 3px var(--admin-focus)!important}
body:has(.adminShell) .productTableCard{overflow:hidden!important}
body:has(.adminShell) .productTableCard .tableTopline{padding:14px 16px!important}
body:has(.adminShell) .productThumb{box-shadow:inset 0 0 0 1px rgba(0,0,0,.025)!important}

/* Orders / customers */
body:has(.adminShell) .orderCard{border:1px solid var(--admin-border)!important;border-radius:14px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important;padding:16px 18px!important}
body:has(.adminShell) .orderCard:hover{border-color:var(--admin-accent)!important;transform:translateY(-1px);transition:transform .15s ease,box-shadow .15s ease}
body:has(.adminShell) .timelineItem{padding:13px 0!important}
body:has(.adminShell) .summaryCard{border:1px solid var(--admin-border)!important;border-radius:16px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-md)!important}
body:has(.adminShell) .summaryLine{font-size:13px!important}

/* Analytics */
body:has(.adminShell) .analyticsPage{padding-bottom:36px!important}
body:has(.adminShell) .metricCard{border:1px solid var(--admin-border)!important;border-radius:16px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important;padding:18px!important}
body:has(.adminShell) .rangeBar{border:1px solid var(--admin-border)!important;background:var(--admin-surface)!important;border-radius:12px!important;padding:4px!important}
body:has(.adminShell) .chart{border:1px solid var(--admin-border)!important;border-radius:16px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important}

/* Editors */
body:has(.adminShell) .productEditor{margin:-28px -34px 0!important;background:var(--admin-bg)!important}
body:has(.adminShell) .editorTopbar{background:var(--admin-topbar-bg)!important;border-bottom:1px solid var(--admin-border)!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .editorTabs{background:var(--admin-surface)!important;border-bottom:1px solid var(--admin-border-soft)!important}
body:has(.adminShell) .editorTabs button{color:var(--admin-muted)!important}
body:has(.adminShell) .editorTabs button.active{color:var(--admin-accent)!important;border-bottom-color:var(--admin-accent)!important}
body:has(.adminShell) .editorBody{max-width:1260px!important}
body:has(.adminShell) .editorCardHead{background:var(--admin-surface)!important}
body:has(.adminShell) .editorCardBody{background:var(--admin-surface)!important}

/* Operations / system */
body:has(.adminShell) .opsTabs{border-color:var(--admin-border)!important;box-shadow:var(--admin-shadow-sm)!important}
body:has(.adminShell) .opsTabs button.active{background:var(--admin-accent)!important;color:var(--admin-accent-ink)!important}
body:has(.adminShell) .healthHero{border:1px solid var(--admin-border)!important;border-radius:16px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-sm)!important}

/* Empty / loading / notices */
body:has(.adminShell) .empty{border:1px dashed var(--admin-border)!important;border-radius:15px!important;background:var(--admin-surface)!important;color:var(--admin-muted)!important}
body:has(.adminShell) .empty strong{color:var(--admin-ink)!important}
body:has(.adminShell) .opsLoading{border:1px dashed var(--admin-border)!important;border-radius:14px!important;background:var(--admin-surface)!important;color:var(--admin-muted)!important}
body:has(.adminShell) .successCard{border:1px solid var(--admin-border)!important;border-radius:18px!important;background:var(--admin-surface)!important;box-shadow:var(--admin-shadow-md)!important}

/* Focus / motion / scrollbar */
body:has(.adminShell) button:focus-visible,
body:has(.adminShell) a:focus-visible,
body:has(.adminShell) input:focus-visible,
body:has(.adminShell) select:focus-visible,
body:has(.adminShell) textarea:focus-visible{outline:3px solid var(--admin-focus)!important;outline-offset:2px!important}
body:has(.adminShell) .adminMain{scrollbar-width:thin;scrollbar-color:var(--admin-border) transparent}
body:has(.adminShell) ::-webkit-scrollbar{width:9px;height:9px}
body:has(.adminShell) ::-webkit-scrollbar-thumb{background:var(--admin-border);border-radius:999px;border:2px solid transparent;background-clip:padding-box}
body:has(.adminShell) ::-webkit-scrollbar-track{background:transparent}

/* Live visitor area inherits the same visual language */
body:has(.adminShell) .liveVisitors{margin-top:44px!important}
body:has(.adminShell) .lv-title{font-size:36px!important}
body:has(.adminShell) .lv-stat{min-height:118px!important;border-radius:16px!important}
body:has(.adminShell) .lv-main{gap:16px!important}

/* Responsive */
@media(max-width:1100px){
  body:has(.adminShell){font-size:14px}
  body:has(.adminShell) .adminMain{padding:0 22px 40px!important}
  body:has(.adminShell) .catalogStats{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  body:has(.adminShell) .productEditor{margin:-22px -22px 0!important}
  body:has(.adminShell) .editorBody{grid-template-columns:1fr!important}
  body:has(.adminShell) .editorRail{position:static!important}
}
@media(max-width:760px){
  body:has(.adminShell) .adminMain{padding:0 14px 32px!important}
  body:has(.adminShell) .adminTopbar{min-height:64px!important;margin-bottom:18px!important}
  body:has(.adminShell) .sectionHead .h2,
  body:has(.adminShell) .catalogHead .h2{font-size:29px!important}
  body:has(.adminShell) .catalogStats{grid-template-columns:1fr 1fr!important}
  body:has(.adminShell) .catalogToolbar{grid-template-columns:1fr!important}
  body:has(.adminShell) .catalogFilters{grid-template-columns:1fr!important}
  body:has(.adminShell) .productEditor{margin:-14px -14px 0!important}
  body:has(.adminShell) .lv-title{font-size:29px!important}
}
@media(max-width:480px){
  body:has(.adminShell) .catalogStats{grid-template-columns:1fr!important}
}

@media(max-width:900px){.adminNavSearchWrap{max-width:520px}.adminNavSearchWrap kbd{display:none}}
`

function normalizePath(pathname: string) { return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname }
function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname); const target = normalizePath(href)
  return target === '/admin' ? current === '/admin' : current === target || current.startsWith(`${target}/`)
}

export default function AdminSidebar({ groups }: { groups: AdminSidebarGroup[] }) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const activeGroups = useMemo(() => new Set(groups.filter(g => g.items.some(i => isActivePath(pathname, i.href))).map(g => g.id)), [groups, pathname])
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(g => [g.id, false])))

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('admin.sidebar.open-groups')
      if (!stored) throw new Error('empty')
      setOpenGroups(current => ({ ...current, ...(JSON.parse(stored) as Record<string, boolean>) }))
    } catch {
      setOpenGroups(Object.fromEntries(groups.map(g => [g.id, activeGroups.has(g.id)])))
    }
  }, [groups, activeGroups])

  useEffect(() => {
    if (!activeGroups.size) return
    setOpenGroups(current => {
      const next = { ...current }
      for (const id of activeGroups) next[id] = true
      return next
    })
  }, [activeGroups])

  useEffect(() => { window.localStorage.setItem('admin.sidebar.open-groups', JSON.stringify(openGroups)) }, [openGroups])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.getElementById('admin-nav-search-mobile')?.focus()
      }
      if (event.key === 'Escape' && document.activeElement?.id === 'admin-nav-search-mobile') {
        setQuery(''); (document.activeElement as HTMLElement).blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleGroups = useMemo(() => groups.map(group => ({
    ...group,
    items: group.items.filter(item => !normalizedQuery || `${group.label} ${item.label}`.toLowerCase().includes(normalizedQuery)),
  })).filter(group => group.items.length), [groups, normalizedQuery])

  function toggleGroup(id: string) { setOpenGroups(current => ({ ...current, [id]: !current[id] })) }

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <nav className="adminNavTree" aria-label="Admin navigation">
      <div className="adminNavSearchWrap">
        <Search size={15} aria-hidden="true" />
        <input id="admin-nav-search-mobile" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search admin…" aria-label="Search admin navigation" />
        <kbd>⌘K</kbd>
      </div>
      {normalizedQuery && <div className="adminNavSearchMeta">{visibleGroups.reduce((n, g) => n + g.items.length, 0)} matches</div>}
      {visibleGroups.map(group => {
        const groupActive = activeGroups.has(group.id)
        const open = normalizedQuery ? true : (openGroups[group.id] ?? false)
        const panelId = `admin-nav-${group.id}-items`
        return <div className={`adminNavGroup${groupActive ? ' active' : ''}`} key={group.id}>
          <button type="button" className={`adminNavGroupButton${groupActive ? ' active' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => toggleGroup(group.id)}>
            <span>{group.label}</span><ChevronDown className={`adminNavChevron${open ? ' open' : ''}`} size={15} />
          </button>
          <div id={panelId} className={`adminNavChildren${open ? ' open' : ''}`} aria-hidden={!open}>
            {group.items.map(item => {
              const active = isActivePath(pathname, item.href); const Icon = iconMap[item.icon] ?? Boxes
              return <Link key={item.href} href={item.href} className={`adminNavItem${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon size={16} /><span>{item.label}</span>
              </Link>
            })}
          </div>
        </div>
      })}
      {!visibleGroups.length && <div className="adminNavEmpty">No admin pages match “{query}”.</div>}
      <div className="adminNavTheme"><AdminThemeToggle /></div>
    </nav>
  </>
}
