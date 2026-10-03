'use client'

// Site-wide pieces of the "market" storefront that sit around every page: the delivery bar and
// category tabs under the header, and the floating WhatsApp button. All three are edited in the
// theme studio (Theme settings › Delivery bar / WhatsApp button; the tabs follow Navigation).
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Heart, LayoutGrid, MapPin, MessageCircle, Package, Search, UserRound, X } from 'lucide-react'
import { whatsappUrl } from '@/lib/links'
import { parseDeliveryAreas } from '@/lib/storefront-market'
import type { Shopper } from './use-shopper'

export const DELIVERY_AREA_KEY = 'ecom-delivery-area-v1'
// Fired when the shopper picks another area, so the product page's delivery line follows.
export const DELIVERY_AREA_EVENT = 'ecom-delivery-area'

export function readDeliveryArea(): string {
  try { return localStorage.getItem(DELIVERY_AREA_KEY) || '' } catch { return '' }
}

export function DeliveryBar({ theme }: { theme: any }) {
  const d = theme.delivery || {}
  const areas = parseDeliveryAreas(d.areas)
  const [area, setArea] = useState('')
  useEffect(() => { const saved = readDeliveryArea(); if (saved) setArea(saved) }, [])
  if (d.enabled === false || !areas.length) return null
  const current = areas.find(a => a.name === area) || areas[0]
  const choose = (name: string) => { setArea(name); try { localStorage.setItem(DELIVERY_AREA_KEY, name) } catch {} window.dispatchEvent(new Event(DELIVERY_AREA_EVENT)) }
  return (
    <div className="mkDelivery">
      <div className="mkWrap mkDeliveryInner">
        <MapPin size={16} className="mkDeliveryPin" aria-hidden="true" />
        <label>{d.label || 'Delivering to'}{' '}
          <select value={current.name} onChange={e => choose(e.target.value)} aria-label="Delivery area">
            {areas.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>
        {current.eta ? <><span className="mkSep" aria-hidden="true">|</span><span>{d.etaLabel || 'Delivery'}: <b>{current.eta}</b></span></> : null}
        {d.note ? <><span className="mkSep" aria-hidden="true">|</span><span className="mkDeliveryNote">{d.note}</span></> : null}
      </div>
    </div>
  )
}

type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null; imageUrl?: string | null }
type NavNode = NavItem & { children: NavNode[] }
export type MenuCollection = { id: string; name: string; slug: string; imageUrl: string | null; count: number }

function navTree(items: NavItem[]): NavNode[] {
  const byId = new Map((items || []).filter(i => i.label).map(i => [i.id, { ...i, children: [] as NavNode[] }]))
  const roots: NavNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// The store's collections for the menus, fetched once per page load and only when a menu
// that shows them is opened.
let collectionsRequest: Promise<MenuCollection[]> | null = null
export function useMenuCollections(active: boolean) {
  const [list, setList] = useState<MenuCollection[] | null>(null)
  useEffect(() => {
    if (!active || list) return
    collectionsRequest ??= fetch('/api/store/collections').then(r => (r.ok ? r.json() : { collections: [] })).then(d => d.collections || []).catch(() => [])
    let live = true
    collectionsRequest.then(c => { if (live) setList(c) })
    return () => { live = false }
  }, [active, list])
  return list
}

// A collection picture, or a neutral icon when there is none or it fails to load.
function MenuImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <LayoutGrid size={18} aria-hidden="true" />
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

function isActiveUrl(url: string, pathname: string, here: string) {
  return url !== '#' && (url === here || (url !== '/' && url === pathname))
}

// Category bar under the header. Computers: "All categories" opens a panel with every
// collection (with its picture); menu items with sub-items open their own panel; the bar
// scrolls with arrow buttons when it doesn't fit. Phones: a row of scrollable pills.
export function CategoryTabs({ navigation }: { navigation: NavItem[] }) {
  const pathname = usePathname() || '/'
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<string | null>(null) // 'all' | root item id
  const [edges, setEdges] = useState({ left: false, right: false })
  const trackRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roots = navTree(navigation)
  const collections = useMenuCollections(panel === 'all')
  useEffect(() => { setSearch(window.location.search); setPanel(null) }, [pathname])

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, roots.length])
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  if (!roots.length) return null
  const here = pathname + search
  const openSoon = (id: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setPanel(id) }
  const closeSoon = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setPanel(null), 160) }
  const scrollBy = (d: number) => trackRef.current?.scrollBy({ left: d * Math.max(240, (trackRef.current?.clientWidth || 600) * 0.6), behavior: 'smooth' })
  const openItem = panel && panel !== 'all' ? roots.find(r => r.id === panel) : null

  return (
    <nav className="mkCats" aria-label="Categories" onMouseLeave={closeSoon}>
      <div className="mkWrap mkCatsInner">
        <button type="button" className={`mkCatsAll ${panel === 'all' ? 'on' : ''}`} aria-expanded={panel === 'all'} onClick={() => setPanel(panel === 'all' ? null : 'all')} onMouseEnter={() => openSoon('all')}>
          <LayoutGrid size={16} aria-hidden="true" /> All categories <ChevronDown size={14} className="mkCatsChevron" aria-hidden="true" />
        </button>
        <div className={`mkCatsScroller ${edges.left ? 'fadeLeft' : ''} ${edges.right ? 'fadeRight' : ''}`}>
          {edges.left && <button type="button" className="mkCatsArrow left" aria-label="Scroll categories left" onClick={() => scrollBy(-1)}><ChevronLeft size={16} /></button>}
          <div className="mkCatsTrack" ref={trackRef} onScroll={measure}>
            {roots.map(item => {
              const url = item.url || '#'
              const active = isActiveUrl(url, pathname, here)
              const hasKids = item.children.length > 0
              return <Link key={item.id} href={url} className={`mkCatsLink ${active ? 'on' : ''} ${panel === item.id ? 'open' : ''}`} aria-current={active ? 'page' : undefined}
                onMouseEnter={() => hasKids ? openSoon(item.id) : closeSoon()}
                aria-haspopup={hasKids ? 'true' : undefined} aria-expanded={hasKids ? panel === item.id : undefined}>
                {item.label}{hasKids && <ChevronDown size={13} className="mkCatsChevron" aria-hidden="true" />}
              </Link>
            })}
          </div>
          {edges.right && <button type="button" className="mkCatsArrow right" aria-label="Scroll categories right" onClick={() => scrollBy(1)}><ChevronRight size={16} /></button>}
        </div>
      </div>

      {panel && <div className="mkCatsPanel" onMouseEnter={() => panel && openSoon(panel)}>
        <div className="mkWrap">
          {panel === 'all' ? (
            <>
              <div className="mkCatsPanelHead"><strong>Shop by category</strong><Link href="/collections" onClick={() => setPanel(null)}>See all collections <ChevronRight size={14} /></Link></div>
              {collections === null ? <div className="mkCatsPanelGrid">{Array.from({ length: 8 }, (_, i) => <span key={i} className="mkCatsTile skeleton" />)}</div>
                : collections.length ? <div className="mkCatsPanelGrid">
                  {collections.slice(0, 16).map(c => <Link key={c.id} href={`/collections/${c.slug}`} className="mkCatsTile" onClick={() => setPanel(null)}>
                    <span className="mkCatsTileImg"><MenuImage src={c.imageUrl} /></span>
                    <span className="mkCatsTileText"><b>{c.name}</b><small>{c.count} product{c.count === 1 ? '' : 's'}</small></span>
                  </Link>)}
                </div>
                : <div className="mkCatsPanelLinks">{roots.map(r => <Link key={r.id} href={r.url || '#'} onClick={() => setPanel(null)}>{r.label}</Link>)}</div>}
            </>
          ) : openItem ? (
            <>
              <div className="mkCatsPanelHead"><strong>{openItem.label}</strong>{openItem.url && <Link href={openItem.url} onClick={() => setPanel(null)}>Shop all {openItem.label} <ChevronRight size={14} /></Link>}</div>
              <div className="mkCatsPanelCols">
                {openItem.children.map(child => <div key={child.id} className="mkCatsCol">
                  <Link href={child.url || '#'} className="mkCatsColHead" onClick={() => setPanel(null)}>{child.imageUrl && <img src={child.imageUrl} alt="" loading="lazy" />}{child.label}</Link>
                  {child.children.map(g => <Link key={g.id} href={g.url || '#'} onClick={() => setPanel(null)}>{g.label}</Link>)}
                </div>)}
              </div>
            </>
          ) : null}
        </div>
      </div>}
    </nav>
  )
}

// Phone menu: slides in from the left with the brand bar, account, search, every menu item
// (sub-items fold open), the store's collections with pictures, and help links.
export function MarketMenu({ open, onClose, navigation, brand, logo, logoWhite, light, shopper, delivery }: { open: boolean; onClose: () => void; navigation: NavItem[]; brand: string; logo?: string; logoWhite?: boolean; light?: boolean; shopper?: Shopper; delivery?: any }) {
  const pathname = usePathname() || '/'
  const roots = navTree(navigation)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [area, setArea] = useState<{ name: string; eta: string } | null>(null)
  const [phone, setPhone] = useState<{ phone: string; country: string } | null>(null)
  const collections = useMenuCollections(open)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    storeSettings().then(data => { const st = data?.settings; if (st?.contact?.phone) setPhone({ phone: st.contact.phone, country: st?.store?.country || 'Lebanon' }) })
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  useEffect(() => { if (open) onClose() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || delivery?.enabled === false) return
    const areas = parseDeliveryAreas(delivery?.areas)
    const saved = readDeliveryArea()
    const current = areas.find(a => a.name === saved) || areas[0]
    if (current) setArea(current)
  }, [open, delivery])

  if (!open) return null
  const wa = phone ? whatsappUrl(phone.phone, phone.country) : ''
  return (
    <div className="mkMenuOverlay" onClick={onClose}>
      <aside className="mkMenu" role="dialog" aria-modal="true" aria-label="Menu" ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className={`mkMenuHead${light ? ' light' : ''}`}>
          <Link href="/" className="mkMenuBrand" onClick={onClose}>{logo ? <img src={logo} alt={brand} className={logoWhite ? 'mkLogoWhite' : undefined} /> : <span>{brand}</span>}</Link>
          <button type="button" className="mkMenuClose" onClick={onClose} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="mkMenuScroll">
          <Link href="/account" className="mkMenuAccount" onClick={onClose}>
            <span className="mkMenuAvatar">{shopper ? shopper.initial : <UserRound size={18} />}</span>
            {shopper
              ? <span><b>{shopper.name}</b><small>My orders, addresses and wallet</small></span>
              : <span><b>My account</b><small>Sign in, orders and addresses</small></span>}
            <ChevronRight size={16} />
          </Link>
          <form className="mkMenuSearch" action="/shop" method="GET" onSubmit={onClose}>
            <Search size={16} aria-hidden="true" />
            <input name="q" placeholder="Search products…" aria-label="Search products" enterKeyHint="search" />
          </form>

          <div className="mkMenuLabel">Menu</div>
          <ul className="mkMenuList">
            {roots.map(item => {
              const hasKids = item.children.length > 0
              const isOpen = expanded === item.id
              const active = item.url && isActiveUrl(item.url, pathname, pathname)
              return <li key={item.id}>
                {hasKids ? <>
                  <button type="button" className={`mkMenuRow ${isOpen ? 'open' : ''}`} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : item.id)}>
                    <span>{item.label}</span><ChevronDown size={16} className="mkMenuChevron" />
                  </button>
                  {isOpen && <ul className="mkMenuSub">
                    {item.url && <li><Link href={item.url} onClick={onClose}>All {item.label}</Link></li>}
                    {item.children.map(c => <li key={c.id}><Link href={c.url || '#'} onClick={onClose}>{c.label}</Link>
                      {c.children.length > 0 && <ul>{c.children.map(g => <li key={g.id}><Link href={g.url || '#'} onClick={onClose}>{g.label}</Link></li>)}</ul>}
                    </li>)}
                  </ul>}
                </> : <Link href={item.url || '#'} className={`mkMenuRow ${active ? 'on' : ''}`} onClick={onClose}><span>{item.label}</span><ChevronRight size={16} /></Link>}
              </li>
            })}
          </ul>

          {collections && collections.length > 0 && <>
            <div className="mkMenuLabel">Shop by category</div>
            <div className="mkMenuTiles">
              {collections.slice(0, 12).map(c => <Link key={c.id} href={`/collections/${c.slug}`} className="mkMenuTile" onClick={onClose}>
                <span className="mkMenuTileImg"><MenuImage src={c.imageUrl} /></span>
                <span>{c.name}</span>
              </Link>)}
            </div>
          </>}

          <div className="mkMenuLabel">Help</div>
          <ul className="mkMenuList mkMenuHelp">
            <li><Link href="/orders/lookup" className="mkMenuRow" onClick={onClose}><Package size={17} /><span>Track my order</span><ChevronRight size={16} /></Link></li>
            <li><Link href="/wishlist" className="mkMenuRow" onClick={onClose}><Heart size={17} /><span>Wishlist</span><ChevronRight size={16} /></Link></li>
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="mkMenuRow"><MessageCircle size={17} /><span>WhatsApp us</span><ChevronRight size={16} /></a></li>}
            <li><Link href="/refund-policy" className="mkMenuRow" onClick={onClose}><FileText size={17} /><span>Delivery &amp; refund policy</span><ChevronRight size={16} /></Link></li>
          </ul>
        </div>
        {area?.name && <div className="mkMenuFoot"><MapPin size={15} aria-hidden="true" /><span>Delivering to <b>{area.name}</b>{area.eta ? <> · {area.eta}</> : null}</span></div>}
      </aside>
    </div>
  )
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" /></svg>
}

// Shared by every page, so the store settings request is made once per page load.
let settingsRequest: Promise<any> | null = null
function storeSettings() {
  settingsRequest ??= fetch('/api/store/settings').then(r => (r.ok ? r.json() : null)).catch(() => null)
  return settingsRequest
}

// The theme studio frame renders its own copy with the draft settings (theme.__preview); the
// root layout's copy (published settings) stays out of it.
export function WhatsAppFloat({ theme }: { theme: any }) {
  const w = theme.whatsapp || {}
  const pathname = usePathname() || '/'
  const [store, setStore] = useState<{ phone: string; country: string } | null>(null)
  const enabled = w.enabled === true
  useEffect(() => {
    if (!enabled) return
    let live = true
    storeSettings().then(data => {
      const s = data?.settings
      if (live) setStore({ phone: s?.contact?.phone || '', country: s?.store?.country || 'Lebanon' })
    })
    return () => { live = false }
  }, [enabled])
  if (!enabled || !store) return null
  // Never over the checkout form or inside the admin.
  if (pathname.startsWith('/admin') || pathname.startsWith('/checkout')) return null
  if (pathname === '/theme-editor-preview' && !theme.__preview) return null
  // The number set in the theme studio, or else the store's contact phone (Settings).
  const base = whatsappUrl(String(w.number || '').trim() || store.phone, store.country)
  if (!base) return null
  const href = w.message ? `${base}?text=${encodeURIComponent(String(w.message).slice(0, 500))}` : base
  const label = String(w.label || '').trim()
  return (
    <a
      className={`mkWhatsApp ${w.position === 'left' ? 'left' : 'right'} ${w.showOnMobile === false ? 'desktopOnly' : ''} ${label ? 'hasLabel' : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label || 'Chat with us on WhatsApp'}
    >
      <WhatsAppIcon />
      {label ? <span>{label}</span> : null}
    </a>
  )
}
