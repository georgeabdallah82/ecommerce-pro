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
.adminNavEmpty{padding:14px 10px;border:1px dashed var(--admin-border);border-radius:10px;color:var(--admin-muted);font-size:12px;line-height:1.5;text-align:center;background:var(--admin-border-soft)}
.adminNavTree,.adminNavGroup,.adminNavChildren{overflow-anchor:none}
.adminNavGroupButton{appearance:none;-webkit-appearance:none;transition:background .16s ease,color .16s ease}
.adminNavGroupButton:focus-visible{outline:3px solid var(--admin-focus);outline-offset:2px}
.adminNavItem{transform:none!important;transition:background .16s ease,color .16s ease,box-shadow .16s ease}
.adminNavItem:hover{transform:none!important}

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
      // Deliberately its own key, not 'admin.sidebar.open-groups' - that one belongs to
      // AdminSidebarDrawer (the desktop aside). This nav tree only ever renders inside the
      // mobile drawer, and the two default their groups open/closed differently, so sharing
      // a key made the initial expand state flip depending on which surface wrote it last.
      const stored = window.localStorage.getItem('admin.sidebar.mobile.open-groups')
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

  useEffect(() => { window.localStorage.setItem('admin.sidebar.mobile.open-groups', JSON.stringify(openGroups)) }, [openGroups])

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
