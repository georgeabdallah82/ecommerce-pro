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

export type AdminSidebarItem = {
  href: string
  label: string
  permission: Permission
  icon: string
}

export type AdminSidebarGroup = {
  id: string
  label: string
  items: AdminSidebarItem[]
}

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

function normalizePath(pathname: string) {
  if (pathname.length > 1) return pathname.replace(/\/$/, '')
  return pathname
}

function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname)
  const target = normalizePath(href)
  return target === '/admin' ? current === '/admin' : current === target || current.startsWith(`${target}/`)
}

export default function AdminSidebar({ groups }: { groups: AdminSidebarGroup[] }) {
  const pathname = usePathname()
  const activeGroups = useMemo(
    () => new Set(groups.filter(group => group.items.some(item => isActivePath(pathname, item.href))).map(group => group.id)),
    [groups, pathname],
  )
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(group => [group.id, false])))

  useEffect(() => {
    const stored = window.localStorage.getItem('admin.sidebar.open-groups')
    if (!stored) {
      setOpenGroups(Object.fromEntries(groups.map(group => [group.id, activeGroups.has(group.id)])))
      return
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, boolean>
      setOpenGroups(current => ({ ...current, ...parsed }))
    } catch {
      setOpenGroups(Object.fromEntries(groups.map(group => [group.id, activeGroups.has(group.id)])))
    }
  }, [groups, activeGroups])

  useEffect(() => {
    if (activeGroups.size === 0) return
    setOpenGroups(current => {
      const next = { ...current }
      for (const id of activeGroups) next[id] = true
      return next
    })
  }, [activeGroups])

  useEffect(() => {
    window.localStorage.setItem('admin.sidebar.open-groups', JSON.stringify(openGroups))
  }, [openGroups])

  function toggleGroup(id: string) {
    setOpenGroups(current => ({ ...current, [id]: !current[id] }))
  }

  return (
    <nav className="adminNavTree" aria-label="Admin navigation">
      {groups.map(group => {
        const groupActive = activeGroups.has(group.id)
        const open = openGroups[group.id] ?? false
        return (
          <div className={`adminNavGroup${groupActive ? ' active' : ''}`} key={group.id}>
            <button
              type="button"
              className={`adminNavGroupButton${groupActive ? ' active' : ''}`}
              aria-expanded={open}
              onClick={() => toggleGroup(group.id)}
            >
              <span>{group.label}</span>
              <ChevronDown className={`adminNavChevron${open ? ' open' : ''}`} size={15} />
            </button>
            <div className={`adminNavChildren${open ? ' open' : ''}`}>
              {group.items.map(item => {
                const active = isActivePath(pathname, item.href)
                const Icon = iconMap[item.icon] ?? Boxes
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`adminNavItem${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
