'use client'

/*
 * The admin's whole navigation surface: a full-width top bar (brand, search,
 * notifications, account) stacked above a persistent left sidebar + main
 * content row - Shopify's own admin shell shape. A command-palette-style
 * search reachable by Ctrl/Cmd+K or the search bar, and a full-screen mobile
 * drawer that substitutes for the sidebar below the sidebar breakpoint.
 * Nothing here uses a global !important rule or a body:has() selector:
 * layout comes entirely from CSS Modules (admin-nav.module.css), so there is
 * no specificity race to lose - the exact trap a previous sidebar attempt
 * hit twice (a flex-direction default and a display:grid/none tie, both
 * "two !important rules, whichever has higher specificity wins" bugs).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity, ArrowLeftRight, BarChart3, Boxes, ClipboardList, CreditCard, FileEdit, FileSpreadsheet, FileText, FolderTree, Image as ImageIcon, Layers3,
  LayoutDashboard, LogOut, Menu, MessageSquare, PackageCheck, Palette, Percent, Radio, RotateCcw, Search, Settings2,
  ShieldCheck, ShoppingBag, Store, Tag, Truck, UserCog, Users, UsersRound, Workflow, X, type LucideIcon,
} from 'lucide-react'
import AdminThemeToggle from '@/components/admin-theme-toggle'
import OrderAlerts from '@/components/order-alerts'
import type { Permission } from '@/lib/permissions'
import styles from './admin-nav.module.css'

export type AdminSidebarItem = { href: string; label: string; permission: Permission; icon: string }
export type AdminSidebarGroup = { id: string; label: string; items: AdminSidebarItem[] }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, orders: ShoppingBag, products: Boxes, inventory: PackageCheck, operations: Workflow,
  customers: Users, categories: FolderTree, collections: Layers3, discounts: Tag, reviews: MessageSquare,
  shipping: Truck, tax: Percent, store: ShoppingBag, theme: Palette, navigation: Menu, content: FileText, files: ImageIcon,
  analytics: BarChart3, system: Activity, users: UserCog, activity: Activity, settings: Settings2,
  orderEdits: FileEdit, purchaseOrders: ClipboardList, transfers: ArrowLeftRight,
  draftOrders: ClipboardList, returns: RotateCcw,
  segments: UsersRound, giftCards: CreditCard,
  liveVisitors: Radio, dataTransfer: FileSpreadsheet,
}

function normalizePath(pathname: string) { return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname }
function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname); const target = normalizePath(href)
  return target === '/admin' ? current === '/admin' : current === target || current.startsWith(`${target}/`)
}

function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !containerRef.current) return
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, containerRef, onClose])
}

function NavGroups({ groups, pathname, onNavigate }: { groups: AdminSidebarGroup[]; pathname: string; onNavigate?: () => void }) {
  return <>
    {groups.map(group => (
      <div className={styles.sidebarGroup} key={group.id}>
        <div className={styles.sidebarGroupLabel}>{group.label}</div>
        {group.items.map(item => {
          const active = isActivePath(pathname, item.href)
          const Icon = iconMap[item.icon] ?? Boxes
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sidebarItem}${active ? ` ${styles.sidebarItemActive}` : ''}`}
              onClick={onNavigate}
            >
              <Icon size={16} aria-hidden="true" /><span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    ))}
  </>
}

export default function AdminNav({
  groups, name, email, role, vapidPublicKey, children,
}: { groups: AdminSidebarGroup[]; name: string | null; email: string; role?: string; vapidPublicKey?: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const accountRef = useRef<HTMLDivElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // A portal needs a document to render into, which only exists after mount.
  useEffect(() => { setMounted(true) }, [])

  // App Router keeps this layout mounted across client navigations - close
  // every open panel when the route actually changes underneath it.
  useEffect(() => { setAccountOpen(false); setMobileOpen(false); setSearchOpen(false) }, [pathname])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (accountOpen && accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [accountOpen])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!searchOpen) { setQuery(''); return }
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [searchOpen])

  useEffect(() => {
    if (!mobileOpen && !searchOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [mobileOpen, searchOpen])

  useFocusTrap(searchOpen, searchPanelRef, () => setSearchOpen(false))
  useFocusTrap(mobileOpen, mobilePanelRef, () => setMobileOpen(false))

  const allItems = useMemo(() => groups.flatMap(group => group.items.map(item => ({ ...item, group: group.label }))), [groups])
  const normalizedQuery = query.trim().toLowerCase()
  const results = useMemo(
    () => (!normalizedQuery ? [] : allItems.filter(item => `${item.group} ${item.label}`.toLowerCase().includes(normalizedQuery)).slice(0, 8)),
    [allItems, normalizedQuery],
  )

  const brand = (
    <span className={styles.brand}>
      <span className={styles.brandMark}><ShieldCheck size={18} aria-hidden="true" /></span>
      <span className={styles.brandText}>Control Center</span>
    </span>
  )

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.hamburger} aria-label="Open admin menu" onClick={() => setMobileOpen(true)}><Menu size={19} aria-hidden="true" /></button>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}><ShieldCheck size={18} aria-hidden="true" /></span>
            <span className={styles.brandText}>Control Center</span>
          </Link>
        </div>

        <button type="button" className={styles.topbarSearch} onClick={() => setSearchOpen(true)}>
          <Search size={15} aria-hidden="true" />
          <span>Search admin…</span>
          <kbd>⌘K</kbd>
        </button>

        <div className={styles.topbarRight}>
          <OrderAlerts vapidPublicKey={vapidPublicKey} />
          <div className={styles.account} ref={accountRef}>
            <button type="button" className={styles.accountBtn} onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} aria-haspopup="menu" aria-label="Account menu">
              <span className={styles.avatar}>{(name || email || 'A').slice(0, 1).toUpperCase()}</span>
            </button>
            {accountOpen && (
              <div className={styles.accountPanel} role="menu">
                <div className={styles.accountHead}>
                  <strong>{name || 'Administrator'}</strong>
                  <span>{email}</span>
                  {role && <span className={styles.rolePill}>{role}</span>}
                </div>
                <div className={styles.accountThemeRow}><AdminThemeToggle /></div>
                <Link href="/" className={styles.accountItem} role="menuitem"><Store size={15} aria-hidden="true" /> View storefront</Link>
                <form action="/api/auth/logout" method="post">
                  <button className={styles.accountItem} type="submit" role="menuitem"><LogOut size={15} aria-hidden="true" /> Sign out</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="Admin sections">
          <nav className={styles.sidebarNav}>
            <NavGroups groups={groups} pathname={pathname} />
          </nav>
        </aside>

        <main className={`adminMain ${styles.mainCol}`}>{children}</main>
      </div>

      {mounted && searchOpen && createPortal(
        <div className={styles.searchOverlay} role="dialog" aria-modal="true" aria-label="Search admin">
          <button type="button" className={styles.searchBackdrop} aria-label="Close search" onClick={() => setSearchOpen(false)} />
          <div className={styles.searchPanel} ref={searchPanelRef}>
            <div className={styles.searchInputWrap}>
              <Search size={16} aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search admin…"
                aria-label="Search admin navigation"
              />
              <kbd>Esc</kbd>
            </div>
            {normalizedQuery && (
              results.length ? (
                <div className={styles.searchResults}>
                  {results.map(item => {
                    const Icon = iconMap[item.icon] ?? Boxes
                    return (
                      <Link key={item.href} href={item.href} className={styles.searchResult} onClick={() => setSearchOpen(false)}>
                        <Icon size={15} aria-hidden="true" />
                        <span>{item.label}</span>
                        <small>{item.group}</small>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.searchEmpty}>No admin pages match &ldquo;{query}&rdquo;.</div>
              )
            )}
          </div>
        </div>,
        document.body,
      )}

      {mounted && mobileOpen && createPortal(
        <div className={styles.mobileOverlay} role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className={styles.mobileBackdrop} aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <div className={styles.mobilePanel} ref={mobilePanelRef}>
            <div className={styles.mobileHead}>
              {brand}
              <button type="button" className={styles.mobileClose} aria-label="Close admin navigation" onClick={() => setMobileOpen(false)}><X size={18} aria-hidden="true" /></button>
            </div>
            <button type="button" className={styles.mobileSearchBtn} onClick={() => { setMobileOpen(false); setSearchOpen(true) }}>
              <Search size={15} aria-hidden="true" /> Search admin…
            </button>
            <nav className={styles.mobileNav} aria-label="Admin sections">
              <NavGroups groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className={styles.mobileFoot}>
              {role && <span className={styles.rolePill}>{role}</span>}
              <div className={styles.accountThemeRow}><AdminThemeToggle /></div>
              <Link href="/" className={styles.accountItem} onClick={() => setMobileOpen(false)}><Store size={15} aria-hidden="true" /> View storefront</Link>
              <form action="/api/auth/logout" method="post">
                <button className={styles.accountItem} type="submit"><LogOut size={15} aria-hidden="true" /> Sign out</button>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
