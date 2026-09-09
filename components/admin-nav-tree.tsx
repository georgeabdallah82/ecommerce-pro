'use client'

/*
 * The single, canonical admin navigation tree - search box, collapsible groups,
 * links with icons and active state. Used identically by both the desktop
 * sidebar (components/admin-sidebar-drawer.tsx) and the mobile drawer
 * (components/admin-mobile-nav.tsx), so there is exactly one place that defines
 * what a nav item looks like and how it behaves. The two callers differ only in
 * their own chrome (a collapsible aside vs. a slide-in drawer) - never in the
 * tree itself. This replaced two independently hand-maintained copies that had
 * drifted to different pixel values for the same classes.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useMemo, useState, type RefObject } from 'react'
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

function normalizePath(pathname: string) { return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname }
function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname); const target = normalizePath(href)
  return target === '/admin' ? current === '/admin' : current === target || current.startsWith(`${target}/`)
}

export default function AdminNavTree({
  groups,
  collapsed = false,
  onRequestExpand,
  onNavigate,
  searchInputRef,
}: {
  groups: AdminSidebarGroup[]
  /** Desktop-only icon rail mode: forces every group open and turns the search box into an "expand me" button. */
  collapsed?: boolean
  onRequestExpand?: () => void
  /** Fired when a nav link is activated - lets a wrapper (the mobile drawer) close itself instantly. */
  onNavigate?: () => void
  /** Lets a wrapper focus the search box imperatively (Ctrl/Cmd+K, a "search" tap) without a global DOM id. */
  searchInputRef?: RefObject<HTMLInputElement | null>
}) {
  const pathname = usePathname()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const activeGroups = useMemo(
    () => new Set(groups.filter(group => group.items.some(item => isActivePath(pathname, item.href))).map(group => group.id)),
    [groups, pathname],
  )
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(group => [group.id, true])))

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('admin.sidebar.open-groups')
      if (stored) setOpenGroups(current => ({ ...current, ...(JSON.parse(stored) as Record<string, boolean>) }))
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeGroups.size) return
    setOpenGroups(current => {
      const next = { ...current }
      activeGroups.forEach(id => { next[id] = true })
      return next
    })
  }, [activeGroups])

  useEffect(() => {
    try { window.localStorage.setItem('admin.sidebar.open-groups', JSON.stringify(openGroups)) } catch {}
  }, [openGroups])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleGroups = useMemo(
    () => groups
      .map(group => ({ ...group, items: group.items.filter(item => !normalizedQuery || `${group.label} ${item.label}`.toLowerCase().includes(normalizedQuery)) }))
      .filter(group => group.items.length),
    [groups, normalizedQuery],
  )

  function toggleGroup(id: string) { setOpenGroups(current => ({ ...current, [id]: !current[id] })) }

  return (
    <nav className="adminNavTree" aria-label="Admin navigation">
      <div
        className="adminNavSearchWrap"
        role={collapsed ? 'button' : undefined}
        tabIndex={collapsed ? 0 : undefined}
        onClick={collapsed ? onRequestExpand : undefined}
        onKeyDown={collapsed ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRequestExpand?.() } } : undefined}
        title={collapsed ? 'Open sidebar search' : undefined}
      >
        <Search size={15} aria-hidden="true" />
        <input
          ref={searchInputRef}
          id={searchId}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape' && query) { setQuery(''); event.currentTarget.blur() } }}
          placeholder="Search admin…"
          aria-label="Search admin navigation"
        />
        <kbd>⌘K</kbd>
      </div>
      {normalizedQuery && !collapsed && <div className="adminNavSearchMeta">{visibleGroups.reduce((count, group) => count + group.items.length, 0)} matches</div>}
      {visibleGroups.map(group => {
        const groupActive = activeGroups.has(group.id)
        const open = collapsed ? true : (normalizedQuery ? true : (openGroups[group.id] ?? true))
        const panelId = `admin-nav-${group.id}-items`
        return (
          <div className={`adminNavGroup${groupActive ? ' active' : ''}`} key={group.id}>
            <button
              type="button"
              className={`adminNavGroupButton${groupActive ? ' active' : ''}`}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => { if (!collapsed) toggleGroup(group.id) }}
              title={collapsed ? group.label : undefined}
            >
              <span>{group.label}</span><ChevronDown className={`adminNavChevron${open ? ' open' : ''}`} size={14} aria-hidden="true" />
            </button>
            <div id={panelId} className={`adminNavChildren${open ? ' open' : ''}`} aria-hidden={!open}>
              {group.items.map(item => {
                const active = isActivePath(pathname, item.href)
                const Icon = iconMap[item.icon] ?? Boxes
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`adminNavItem${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                  >
                    <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
      {!visibleGroups.length && <div className="adminNavEmpty">No admin pages match “{query}”.</div>}
      <div className="adminNavTheme"><AdminThemeToggle /></div>
    </nav>
  )
}
