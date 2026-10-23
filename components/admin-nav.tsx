'use client'

/*
 * The admin's whole navigation surface: a full-height dark sidebar (store logo, sections,
 * signed-in user) beside a column with the sticky top bar (search, notifications, account)
 * and the page. Below 900px the sidebar becomes a bottom tab bar plus a full menu drawer.
 * A command-palette search opens from the search bar or Ctrl/Cmd+K. Layout comes entirely
 * from CSS Modules (admin-nav.module.css): no global !important rule or body:has() selector,
 * so there is no specificity race to lose.
 */

import Link from '@/components/admin-link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, ArrowLeftRight, ChevronDown, Rocket, Star, BarChart3, Boxes, ClipboardList, CreditCard, FileEdit, FileText, Gauge, Image as ImageIcon, Layers3, LayoutDashboard, LogOut, Mail, Megaphone, Menu, MessageSquare, PackageCheck, Palette, Percent, Radio, RotateCcw, Search, Settings2, ShoppingBag, MoreHorizontal, Store, Tag, Truck, UserCog, Users, UsersRound, Workflow, X, PackagePlus, MessageCircleQuestion, HeartHandshake, UserPlus, PackageSearch, ScanBarcode, Barcode, BadgeDollarSign, Contact, CalendarHeart, type LucideIcon, Gift } from 'lucide-react'
import AdminThemeToggle from '@/components/admin-theme-toggle'
import OrderAlerts from '@/components/order-alerts'
import type { Permission } from '@/lib/permissions'
import styles from './admin-nav.module.css'

// `more` items sit behind a "More" toggle under their group (rarely used pages); `alsoActive` lists
// other addresses that count as this item (the pages of one tabbed section).
export type AdminSidebarItem = { href: string; label: string; permission: Permission; icon: string; more?: boolean; alsoActive?: string[] }
export type AdminSidebarGroup = { id: string; label: string; moreLabel?: string; items: AdminSidebarItem[] }

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, orders: ShoppingBag, products: Boxes, inventory: PackageCheck, operations: Workflow,
  customers: Users, collections: Layers3, discounts: Tag, reviews: MessageSquare,
  shipping: Truck, tax: Percent, store: ShoppingBag, theme: Palette, navigation: Menu, content: FileText, files: ImageIcon,
  analytics: BarChart3, system: Activity, websiteStatus: Gauge, launch: Rocket, users: UserCog, activity: Activity, settings: Settings2,
  orderEdits: FileEdit, purchaseOrders: ClipboardList, transfers: ArrowLeftRight,
  draftOrders: ClipboardList, returns: RotateCcw,
  segments: UsersRound, giftCards: CreditCard,
  liveVisitors: Radio, notices: Megaphone, pushCampaigns: Megaphone, newsletter: Mail, bundles: PackagePlus,
  questions: MessageCircleQuestion, winback: HeartHandshake, rewards: Gift, invites: UserPlus, influencers: Star, quantityDeals: Layers3, drivers: Truck, reorder: PackageSearch, stockCount: ScanBarcode, labels: Barcode, prices: BadgeDollarSign, suppliers: Contact, occasions: CalendarHeart,
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

function itemActive(pathname: string, item: AdminSidebarItem) {
  return isActivePath(pathname, item.href) || !!item.alsoActive?.some(href => isActivePath(pathname, href))
}

function NavLink({ item, pathname, onNavigate, badge }: { item: AdminSidebarItem; pathname: string; onNavigate?: () => void; badge?: string }) {
  const active = itemActive(pathname, item)
  const Icon = iconMap[item.icon] ?? Boxes
  return (
    <Link
      href={item.href}
      className={`${styles.sidebarItem}${active ? ` ${styles.sidebarItemActive}` : ''}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={16} aria-hidden="true" /><span>{item.label}</span>{badge && <span className={styles.navBadge}>{badge}</span>}
    </Link>
  )
}

function NavGroup({ group, pathname, onNavigate, badges }: { group: AdminSidebarGroup; pathname: string; onNavigate?: () => void; badges: Record<string, string> }) {
  const main = group.items.filter(item => !item.more)
  const more = group.items.filter(item => item.more)
  // Opens by itself when you are on one of the tucked-away pages, so the menu never hides where you are.
  const onMorePage = more.some(item => itemActive(pathname, item))
  const [open, setOpen] = useState(onMorePage)
  useEffect(() => { if (onMorePage) setOpen(true) }, [onMorePage])
  return (
    <div className={styles.sidebarGroup}>
      <div className={styles.sidebarGroupLabel}>{group.label}</div>
      {main.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} badge={badges[item.href]} />)}
      {more.length > 0 && <>
        <button type="button" className={styles.sidebarMore} onClick={() => setOpen(value => !value)} aria-expanded={open}>
          <ChevronDown size={14} aria-hidden="true" className={open ? styles.sidebarMoreOpen : undefined} />
          <span>{group.moreLabel || 'More'}</span>
        </button>
        {open && more.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} badge={badges[item.href]} />)}
      </>}
    </div>
  )
}

function NavGroups({ groups, pathname, onNavigate, badges = {} }: { groups: AdminSidebarGroup[]; pathname: string; onNavigate?: () => void; badges?: Record<string, string> }) {
  return <>{groups.map(group => <NavGroup key={group.id} group={group} pathname={pathname} onNavigate={onNavigate} badges={badges} />)}</>
}

export type AdminBrand = { name: string; logoUrl?: string; logoDarkUrl?: string; iconUrl?: string }

// Phone bottom bar: the four places used most, plus "More" for the full menu.
const TAB_HREFS = [
  { href: '/admin', label: 'Home', icon: 'dashboard' },
  { href: '/admin/orders', label: 'Orders', icon: 'orders' },
  { href: '/admin/products', label: 'Products', icon: 'products' },
  { href: '/admin/customers', label: 'Customers', icon: 'customers' },
]

export default function AdminNav({
  groups, name, email, role, vapidPublicKey, brand: storeBrand, ordersToFulfill = 0, banner, children,
}: { groups: AdminSidebarGroup[]; name: string | null; email: string; role?: string; vapidPublicKey?: string; brand?: AdminBrand; ordersToFulfill?: number; banner?: React.ReactNode; children: React.ReactNode }) {
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
  // The browser tab names the page ("Orders \u00b7 Admin") instead of the store name on every page.
  // After a click between pages Next adds a fresh <title> with the store name in front of the old one
  // and the browser reads the first, so every <title> is kept in step, and again whenever the head changes.
  useEffect(() => {
    const current = allItems.filter(item => itemActive(pathname, item)).sort((a, b) => b.href.length - a.href.length)[0]
    if (!current) return
    const wanted = `${current.label} \u00b7 Admin`
    const apply = () => {
      document.querySelectorAll('title').forEach(el => { if (el.textContent !== wanted) el.textContent = wanted })
      if (document.title !== wanted) document.title = wanted
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [allItems, pathname])

  const normalizedQuery = query.trim().toLowerCase()
  const results = useMemo(
    () => (!normalizedQuery ? [] : allItems.filter(item => `${item.group} ${item.label}`.toLowerCase().includes(normalizedQuery)).slice(0, 8)),
    [allItems, normalizedQuery],
  )

  const storeName = storeBrand?.name || 'Control Center'
  const initials = (name || email || 'A').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const allowedHrefs = new Set(allItems.map(item => item.href))
  const tabs = TAB_HREFS.filter(tab => allowedHrefs.has(tab.href))
  const badge = ordersToFulfill > 99 ? '99+' : ordersToFulfill > 0 ? String(ordersToFulfill) : ''
  // Logo for the dark sidebar/drawer (the store's "dark background" logo), and for light surfaces.
  const darkLogo = storeBrand?.logoDarkUrl
    ? <img className={styles.logoImg} src={storeBrand.logoDarkUrl} alt={storeName} />
    : <span className={styles.brandTextDark}>{storeName}</span>
  const lightLogo = storeBrand?.logoUrl
    ? <img className={styles.logoImg} src={storeBrand.logoUrl} alt={storeName} />
    : <span className={styles.brandText}>{storeName}</span>
  const brand = <span className={styles.brand}>{darkLogo}</span>

  const accountMenu = (
    <div className={styles.account} ref={accountRef}>
      <button type="button" className={styles.accountBtn} onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} aria-haspopup="menu" aria-label="Account menu">
        <span className={styles.avatar}>{initials}</span>
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
  )

  return (
    <>
      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="Admin sections">
          <Link href="/admin" className={styles.sidebarBrand} aria-label={`${storeName} admin home`}>{darkLogo}</Link>
          <nav className={styles.sidebarNav}>
            <NavGroups groups={groups} pathname={pathname} badges={{ '/admin/orders': badge }} />
          </nav>
          <div className={styles.userCard}>
            <span className={styles.userAvatar}>{initials}</span>
            <span className={styles.userText}><strong>{name || 'Administrator'}</strong><small>{role || email}</small></span>
            <form action="/api/auth/logout" method="post">
              <button className={styles.userSignOut} type="submit" aria-label="Sign out" title="Sign out"><LogOut size={15} aria-hidden="true" /></button>
            </form>
          </div>
        </aside>

        <div className={styles.column}>
          <header className={`${styles.topbar} adminTopbar`}>
            <Link href="/admin" className={styles.topbarLogo} aria-label={`${storeName} admin home`}><span className="adminLogoLight">{lightLogo}</span><span className="adminLogoDark">{darkLogo}</span></Link>
            <button type="button" className={styles.topbarSearch} onClick={() => setSearchOpen(true)}>
              <Search size={15} aria-hidden="true" />
              <span>Search admin…</span>
              <kbd>⌘K</kbd>
            </button>
            <div className={styles.topbarRight}>
              <OrderAlerts vapidPublicKey={vapidPublicKey} />
              {accountMenu}
            </div>
          </header>
          {banner}
          <main className={`adminMain ${styles.mainCol}`}>{children}</main>
        </div>
      </div>

      <nav className={styles.tabbar} aria-label="Quick navigation">
        {tabs.map(tab => {
          const Icon = iconMap[tab.icon] ?? Boxes
          const active = isActivePath(pathname, tab.href)
          return (
            <Link key={tab.href} href={tab.href} className={`${styles.tab}${active ? ` ${styles.tabActive}` : ''}`} aria-current={active ? 'page' : undefined}>
              <span className={styles.tabIcon}><Icon size={19} aria-hidden="true" />{tab.href === '/admin/orders' && badge && <span className={styles.tabBadge}>{badge}</span>}</span>
              {tab.label}
            </Link>
          )
        })}
        <button type="button" className={styles.tab} onClick={() => setMobileOpen(true)} aria-label="More admin sections">
          <span className={styles.tabIcon}><MoreHorizontal size={19} aria-hidden="true" /></span>
          More
        </button>
      </nav>

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
              <NavGroups groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} badges={{ '/admin/orders': badge }} />
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
