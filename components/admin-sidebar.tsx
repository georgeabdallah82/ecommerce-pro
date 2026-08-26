'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronDown,
  FileText,
  FolderTree,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PackageCheck,
  Palette,
  Search,
  Settings2,
  ShoppingBag,
  Tag,
  Truck,
  UserCog,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'

export type AdminSidebarItem = { href: string; label: string; permission: Permission; icon: string }
export type AdminSidebarGroup = { id: string; label: string; items: AdminSidebarItem[] }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, orders: ShoppingBag, products: Boxes, inventory: PackageCheck,
  operations: Workflow, customers: Users, categories: FolderTree, collections: Layers3,
  discounts: Tag, reviews: MessageSquare, shipping: Truck, store: ShoppingBag, theme: Palette,
  navigation: Menu, content: FileText, files: ImageIcon, analytics: BarChart3, system: Activity,
  users: UserCog, activity: Activity, settings: Settings2,
}

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

  useEffect(() => { for (const id of activeGroups) setOpenGroups(current => ({ ...current, [id]: true })) }, [activeGroups])
  useEffect(() => { window.localStorage.setItem('admin.sidebar.open-groups', JSON.stringify(openGroups)) }, [openGroups])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('admin-nav-search')?.focus() }
      if (event.key === 'Escape' && document.activeElement?.id === 'admin-nav-search') { setQuery(''); (document.activeElement as HTMLElement)?.blur() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => !normalizedQuery || `${group.label} ${item.label}`.toLowerCase().includes(normalizedQuery)),
  })).filter(group => group.items.length)

  function toggleGroup(id: string) { setOpenGroups(current => ({ ...current, [id]: !current[id] })) }

  return (
    <nav className="adminNavTree" aria-label="Admin navigation">
      <div className="adminNavSearchWrap">
        <Search size={15} aria-hidden="true" />
        <input
          id="admin-nav-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search admin…"
          aria-label="Search admin navigation"
        />
        <kbd>⌘K</kbd>
      </div>
      {normalizedQuery && <div className="adminNavSearchMeta">{visibleGroups.reduce((n, g) => n + g.items.length, 0)} matches</div>}
      {visibleGroups.map(group => {
        const groupActive = activeGroups.has(group.id); const open = normalizedQuery ? true : (openGroups[group.id] ?? false)
        return (
          <div className={`adminNavGroup${groupActive ? ' active' : ''}`} key={group.id}>
            <button type="button" className={`adminNavGroupButton${groupActive ? ' active' : ''}`} aria-expanded={open} onClick={() => toggleGroup(group.id)}>
              <span>{group.label}</span><ChevronDown className={`adminNavChevron${open ? ' open' : ''}`} size={15} />
            </button>
            <div className={`adminNavChildren${open ? ' open' : ''}`}>
              {group.items.map(item => {
                const active = isActivePath(pathname, item.href); const Icon = iconMap[item.icon] ?? Boxes
                return <Link key={item.href} href={item.href} className={`adminNavItem${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} /><span>{item.label}</span>{active && <span className="adminNavActiveDot" aria-hidden="true" />}
                </Link>
              })}
            </div>
          </div>
        )
      })}
      {!visibleGroups.length && <div className="adminNavEmpty">No admin pages match “{query}”.</div>}
    </nav>
  )
}
