'use client'

import { ArrowRight, Check, ChevronDown, Clock, Gift, Heart, Megaphone, Menu, Minus, Plus, Search, ShoppingBag, Sparkles, Tag, Trash2, Truck, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { keyOf, useCart } from './cart-provider'

type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null }
type TreeItem = NavItem & { children: TreeItem[] }

const ANNOUNCEMENT_ICONS: Record<string, typeof Sparkles> = { spark: Sparkles, truck: Truck, tag: Tag, gift: Gift, clock: Clock, megaphone: Megaphone }

// Reads settings from the section first (what the theme editor's Content
// panel actually edits), falling back to the theme-level announcement
// defaults, then a hardcoded default -- mirrors the fallback chain already
// used for text/link below. Extracted as its own component (not inline JSX)
// because it needs its own rotation-timer state, and it's rendered from two
// different places (header-disabled early return, and above/below the
// header in the normal return).
function AnnouncementBar({ theme, announcementSection, closed, onDismiss }: { theme: any; announcementSection: any; closed: boolean; onDismiss: () => void }) {
  const s = announcementSection?.settings || {}
  const g = theme.announcement || {}
  const height = Number(s.height ?? g.height ?? 40)
  const speed = Math.max(1, Number(s.speed ?? g.speed ?? 6))
  const autoplay = s.autoplay ?? g.autoplay ?? true
  const dismissible = s.dismissible ?? g.dismissible ?? true
  const showIcon = s.showIcon ?? g.showIcon ?? false
  const iconKey = s.icon ?? g.icon ?? 'spark'
  const uppercase = s.uppercase ?? g.uppercase ?? false
  const blocks = Array.isArray(announcementSection?.blocks) ? announcementSection.blocks : []
  const messages = blocks.length
    ? blocks.map((b: any) => ({ text: b.settings?.text || '', link: b.settings?.link || '' }))
    : [{ text: s.text || g.text || 'Free shipping on orders over $50', link: s.link || g.link || '' }]
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!autoplay || messages.length < 2) return
    const id = setInterval(() => setIndex(i => (i + 1) % messages.length), speed * 1000)
    return () => clearInterval(id)
  }, [autoplay, speed, messages.length])
  if (closed) return null
  const current = messages[index % messages.length] || messages[0]
  const Icon = ANNOUNCEMENT_ICONS[iconKey] || Sparkles
  return (
    <div className="focalAnnouncementGlobal">
      <div className="focalAnnouncementGlobalInner" style={{ '--focal-announcement-height': `${height}px`, textTransform: uppercase ? 'uppercase' : 'none' } as React.CSSProperties}>
        {showIcon && <span className="focalAnnouncementIcon"><Icon size={13}/></span>}
        <span>{current.text}</span>
        {current.link && <Link href={current.link}>Learn more</Link>}
        {dismissible && <button className="focalAnnouncementDismiss" aria-label="Dismiss" onClick={onDismiss}><X size={13}/></button>}
      </div>
    </div>
  )
}

const css = `
.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:background-color .3s ease}
.focalNavInner{height:76px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px}
.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
.focalLogo img{display:block;height:auto;max-height:52px;object-fit:contain;background:transparent!important;border:0!important;box-shadow:none!important}
.focalNavLinks{display:flex;justify-content:center;gap:24px;height:100%}
.focalNavItem{position:relative;display:flex;align-items:center;height:100%}
.focalNavLink{border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;height:100%;padding:0}
.focalNavLink a{color:inherit;text-decoration:none;transition:color .18s ease}
.focalNavLink a:hover{color:var(--focal-primary)}
.focalNavChevron{width:28px;height:28px;display:grid;place-items:center;border:0;background:transparent;cursor:pointer;color:inherit;opacity:.7;transition:transform .2s ease}
.focalDropdown{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);min-width:250px;background:rgba(255,255,255,.98);border:1px solid var(--focal-line);border-radius:14px;box-shadow:0 20px 50px rgba(25,21,18,.14);padding:8px;backdrop-filter:blur(18px);animation:focalMenuPop .2s cubic-bezier(.16,1,.3,1)}
@keyframes focalMenuPop{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.focalDropdownItem{position:relative}
.focalDropdownLink{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:9px;color:var(--focal-ink);text-decoration:none;font-size:12px;font-weight:750;transition:background-color .15s ease,color .15s ease}
.focalDropdownLink:hover{background:var(--focal-soft);color:var(--focal-primary)}
.focalDropdownNested{position:absolute;left:calc(100% + 8px);top:-8px;min-width:230px;background:#fff;border:1px solid var(--focal-line);border-radius:14px;box-shadow:0 18px 46px rgba(25,21,18,.14);padding:8px}
.focalNavActions{display:flex;gap:8px;align-items:center}
.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer;transition:transform .15s ease,background-color .15s ease,border-color .15s ease}
.focalNavIcon:hover{transform:translateY(-1px);background:#fff;border-color:rgba(0,0,0,.15)}
.focalNavIcon:active{transform:scale(.95)}
.focalCartCount{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;border-radius:999px;background:var(--focal-primary);color:#fff;font-size:10px;font-weight:900;display:grid;place-items:center;padding:0 5px;box-shadow:0 2px 6px rgba(0,0,0,.2);animation:focalBadgeBounce .3s cubic-bezier(.16,1,.3,1)}
@keyframes focalBadgeBounce{0%{transform:scale(.6)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
.focalNavMobile{display:none;width:42px;height:42px;border:1px solid var(--focal-line);background:#fff;border-radius:12px;place-items:center;cursor:pointer}
.focalAnnouncementGlobal{background:var(--store-announcement-bg,var(--focal-primary));color:var(--store-announcement-text,#fff)}.focalAnnouncementGlobalInner{display:flex;align-items:center;justify-content:center;gap:10px;padding:0 16px;font-size:12px;font-weight:850;transition:opacity .25s ease}.focalAnnouncementGlobalInner a{text-decoration:underline;text-underline-offset:3px;color:inherit}.focalAnnouncementDismiss{border:0;background:transparent;color:inherit;opacity:.8;cursor:pointer;flex:none}.focalAnnouncementIcon{display:inline-flex;flex:none;opacity:.9}

/* ANIMATED CART DRAWER */
.focalCartOverlay{position:fixed;inset:0;z-index:100;background:rgba(18,16,14,.42);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;justify-content:flex-end;animation:focalFadeIn .22s ease-out forwards}
.focalCartDrawer{width:min(450px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-18px 0 60px rgba(0,0,0,.2);animation:focalSlideIn .32s cubic-bezier(.16,1,.3,1) forwards;position:relative}
@keyframes focalSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes focalFadeIn{from{opacity:0}to{opacity:1}}

.focalCartHead{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid var(--focal-line);background:#fff}
.focalCartHeadTitle{display:flex;align-items:center;gap:10px}
.focalCartHeadTitle strong{font-size:17px;font-weight:850;color:var(--focal-ink)}
.focalCartHeadBadge{font-size:11px;font-weight:700;color:var(--focal-primary);background:var(--focal-soft);padding:3px 9px;border-radius:999px}

/* FREE SHIPPING PROGRESS METER */
.focalShippingMeter{padding:14px 22px;background:#fafaf8;border-bottom:1px solid var(--focal-line);transition:background-color .3s ease}
.focalShippingMeter.isUnlocked{background:#f0fdf4}
.focalShippingText{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:750;color:var(--focal-ink);margin-bottom:9px}
.focalShippingText.isUnlocked{color:#15803d}
.focalShippingTrack{width:100%;height:7px;background:#e5e5df;border-radius:999px;overflow:hidden;position:relative}
.focalShippingBar{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--focal-primary),#10b981);transition:width .45s cubic-bezier(.16,1,.3,1)}
.focalShippingBar.isUnlocked{background:#16a34a}

.focalCartItems{flex:1;overflow-y:auto;padding:16px 22px}
.focalCartItem{display:grid;grid-template-columns:82px 1fr auto;gap:14px;padding:14px 0;border-bottom:1px solid var(--focal-line);align-items:start;transition:background-color .15s ease}
.focalCartItem img{width:82px;height:96px;object-fit:cover;border-radius:11px;background:#f4efe9}
.focalCartInfo{display:grid;gap:6px}
.focalCartInfo strong{font-size:13.5px;font-weight:800;color:var(--focal-ink);line-height:1.3}
.focalCartInfo small{font-size:13px;font-weight:750;color:var(--focal-muted)}
.focalCartQty{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--focal-line);border-radius:8px;padding:2px 4px;background:#fff;width:fit-content}
.focalCartQty button{width:24px;height:24px;border:0;background:transparent;border-radius:6px;display:grid;place-items:center;cursor:pointer;color:var(--focal-ink);transition:background-color .12s ease}
.focalCartQty button:hover{background:var(--focal-soft)}
.focalCartQty button:active{transform:scale(.9)}
.focalCartQty span{min-width:20px;text-align:center;font-size:12px;font-weight:800}
.focalCartDeleteBtn{border:0;background:transparent;color:var(--focal-muted);cursor:pointer;padding:6px;border-radius:8px;display:grid;place-items:center;transition:all .15s ease}
.focalCartDeleteBtn:hover{color:#dc2626;background:#fee2e2}

.focalCartFoot{border-top:1px solid var(--focal-line);padding:20px 22px;background:#fff;box-shadow:0 -10px 25px rgba(0,0,0,.03)}
.focalCartTotal{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.focalCartTotal span:first-child{font-size:14px;font-weight:700;color:var(--focal-muted)}
.focalCartTotal strong{font-size:20px;font-weight:900;color:var(--focal-ink)}
.focalCartTaxNote{font-size:11.5px;color:var(--focal-muted);margin-bottom:14px}
.focalCartActions{display:grid;gap:8px}
.focalCartEmpty{padding:60px 24px;text-align:center;color:var(--focal-muted);display:grid;gap:12px;place-items:center}
.focalCartEmptyIcon{width:64px;height:64px;border-radius:999px;background:var(--focal-soft);color:var(--focal-primary);display:grid;place-items:center;margin-bottom:6px}

/* LIVE SEARCH OVERLAY */
.focalSearchOverlay{position:fixed;inset:0;z-index:100;background:rgba(18,16,14,.42);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:grid;place-items:start center;padding:32px 16px;animation:focalFadeIn .22s ease-out forwards}
.focalSearchCard{width:min(680px,100%);background:#fff;border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.22);overflow:hidden;animation:focalPopIn .25s cubic-bezier(.16,1,.3,1) forwards}
@keyframes focalPopIn{from{opacity:0;transform:scale(.96) translateY(-10px)}to{opacity:1;transform:scale(1) translateY(0)}}
.focalSearchHeader{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--focal-line)}
.focalSearchHeader input{flex:1;height:44px;border:0;outline:none;font-size:16px;font-weight:700;background:transparent;color:var(--focal-ink)}
.focalSearchChips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;background:#fafaf8;border-bottom:1px solid var(--focal-line)}
.focalSearchChip{border:1px solid var(--focal-line);background:#fff;padding:5px 12px;border-radius:999px;font-size:11.5px;font-weight:750;color:var(--focal-ink);cursor:pointer;transition:all .15s ease}
.focalSearchChip:hover{border-color:var(--focal-primary);color:var(--focal-primary);background:var(--focal-soft)}
.focalSearchResults{max-height:420px;overflow-y:auto;padding:12px 20px}
.focalSearchItem{display:grid;grid-template-columns:52px 1fr auto;gap:14px;align-items:center;padding:10px 8px;border-radius:12px;text-decoration:none;color:inherit;transition:background-color .15s ease}
.focalSearchItem:hover{background:var(--focal-soft)}
.focalSearchItem img{width:52px;height:52px;border-radius:8px;object-fit:cover;background:#f4efe9}
.focalSearchItemInfo{display:grid;gap:2px}
.focalSearchItemInfo strong{font-size:13.5px;font-weight:800;color:var(--focal-ink)}
.focalSearchItemInfo small{font-size:11px;color:var(--focal-muted);font-weight:700}
.focalSearchItemPrice{font-size:13px;font-weight:850;color:var(--focal-primary)}

/* MOBILE MENU */
.focalMobileOverlay{position:fixed;inset:0;z-index:100;background:rgba(18,16,14,.38);backdrop-filter:blur(6px);animation:focalFadeIn .2s ease-out forwards}
.focalMobilePanel{margin-left:auto;width:min(380px,88%);height:100%;background:#fff;padding:22px;overflow-y:auto;animation:focalSlideIn .3s cubic-bezier(.16,1,.3,1) forwards}
.focalMobileRow{display:flex;align-items:center;gap:6px;border-top:1px solid var(--focal-line);padding:14px 0}
.focalMobileRow>a{font-size:16px;font-weight:850;color:var(--focal-ink);text-decoration:none;flex:1}
.focalMobileToggle{width:34px;height:34px;border:1px solid var(--focal-line);border-radius:9px;background:#fff;display:grid;place-items:center;cursor:pointer}
.focalMobileChildren{display:grid;padding:0 0 6px 12px}
.focalMobileChild{padding:8px 0;font-size:13px;color:var(--focal-muted);text-decoration:none}
.focalMobileChild.level2{padding-left:12px;font-size:12px}

/* ALIEXPRESS-STYLE INLINE SEARCH BAR (desktop) */
.aliNavSearchWrap{flex:1;max-width:760px;margin:0 24px;position:relative}
.aliNavSearchBar{display:flex;align-items:stretch;height:42px;border:2px solid var(--focal-primary);border-radius:999px;overflow:hidden;background:#fff}
.aliNavSearchBar input{flex:1;min-width:0;border:0;outline:0;padding:0 16px;font-size:13.5px;font-weight:600;background:transparent;color:var(--focal-ink)}
.aliNavSearchSubmit{border:0;background:var(--focal-primary);color:#fff;padding:0 22px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;cursor:pointer;flex:none}
.aliNavSearchDropdown{position:absolute;top:calc(100% + 10px);left:0;right:0;background:#fff;border:1px solid var(--focal-line);border-radius:16px;box-shadow:0 20px 50px rgba(25,21,18,.14);max-height:420px;overflow-y:auto;padding:10px;z-index:70;animation:focalMenuPop .18s cubic-bezier(.16,1,.3,1)}
.aliNavSearchIconMobile{display:none}
@media(max-width:900px){.aliNavSearchWrap{display:none}.aliNavSearchIconMobile{display:grid}}

.focalNavSecondary{border-top:1px solid var(--focal-line)}
.focalNavSecondaryInner{height:46px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.focalNavSecondary .focalNavLinks{display:flex;height:100%;gap:22px}
.focalNavSecondary .focalNavItem{height:100%}
.focalNavSecondary .focalNavLink{font-size:12.5px;font-weight:750}
@media(max-width:900px){.focalNavSecondary{display:none}}

@media(max-width:900px){.focalNavInner{grid-template-columns:auto 1fr auto;gap:12px}.focalNavMobile{display:grid}.focalNavLinks{display:none}.focalLogo{justify-content:center}.focalNavActions .focalNavIcon:nth-child(2){display:none}}
@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}.focalAnnouncementGlobalInner{font-size:11px;min-height:38px}}
`

function templateForPath(pathname: string) {
  if (pathname === '/') return 'Home page'
  if (pathname.startsWith('/shop')) return 'Products'
  if (pathname.startsWith('/product/')) return 'Product'
  if (pathname === '/collections') return 'Collections'
  if (pathname.startsWith('/collections/')) return 'Collection'
  if (pathname.startsWith('/cart')) return 'Cart'
  if (pathname.startsWith('/blog')) return 'Blog'
  return 'Pages'
}

function buildTree(items: NavItem[]): TreeItem[] {
  const byId = new Map(items.map(item => [item.id, { ...item, children: [] as TreeItem[] }]))
  const roots: TreeItem[] = []
  for (const item of items) {
    const node = byId.get(item.id)
    if (!node) continue
    const parentId = item.parentId || null
    const parent = parentId ? byId.get(parentId) : null
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function hasChildren(item: TreeItem) { return item.children.length > 0 }

function DesktopNode({ item, openId, setOpenId, nested = false }: { item: TreeItem; openId: string | null; setOpenId: (id: string | null) => void; nested?: boolean }) {
  const open = openId === item.id
  if (!hasChildren(item)) return <Link className="focalDropdownLink" href={item.url || '#'}>{item.label}</Link>
  return (
    <div className={nested ? 'focalDropdownItem' : 'focalNavItem'} onMouseEnter={() => setOpenId(item.id)}>
      <div className="focalNavLink">
        <Link href={item.url || '#'}>{item.label}</Link>
        <button className="focalNavChevron" aria-label={`Open ${item.label} submenu`} onClick={(e) => { e.preventDefault(); setOpenId(open ? null : item.id) }}><ChevronDown size={13} /></button>
      </div>
      {open && <div className={nested ? 'focalDropdownNested' : 'focalDropdown'} onMouseLeave={() => setOpenId(null)}>{item.children.map(child => <DesktopNode key={child.id} item={child} openId={openId} setOpenId={setOpenId} nested />)}</div>}
    </div>
  )
}

export default function StoreNavFixed({ theme, navigation }: { theme: any; navigation: NavItem[] }) {
  const pathname = usePathname() || '/'
  const templateKey = templateForPath(pathname)
  const template = Array.isArray(theme.editorTemplates?.[templateKey]) ? theme.editorTemplates[templateKey] : null
  const headerSection = template?.find((section: any) => section.type === 'header')
  const announcementSection = template?.find((section: any) => section.type === 'announcement')
  const headerSettings = { ...(theme.header || {}), ...(headerSection?.settings || {}) }
  const headerEnabled = theme.header?.enabled !== false && headerSection?.enabled !== false
  const announcementEnabled = theme.announcement?.enabled !== false && announcementSection?.enabled !== false && announcementSection?.settings?.enabled !== false
  
  const { items, updateQty, removeItem, subtotal, count, isOpen: isCartOpen, openCart, closeCart } = useCart()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState<Set<string>>(new Set())
  const [announcementClosed, setAnnouncementClosed] = useState(false)
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false)
  const desktopSearchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reads the store's actual configured threshold (checkout.freeShippingThreshold, in dollars)
  // the same way components/aliexpress-cart.tsx already does, rather than a hardcoded value --
  // this drawer previously always used $50 regardless of what the merchant actually configured
  // (seeded default is $100), so it could tell a customer they'd unlocked free shipping only
  // for checkout to still charge them, or vice versa.
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/store/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!active) return
        const threshold = Number(data?.settings?.checkout?.freeShippingThreshold)
        if (Number.isFinite(threshold) && threshold > 0) setFreeShippingThreshold(Math.round(threshold * 100))
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  const remainingForFreeShipping = freeShippingThreshold ? Math.max(0, freeShippingThreshold - subtotal) : 0
  const shippingProgress = freeShippingThreshold ? Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100)) : 0
  const freeShippingUnlocked = freeShippingThreshold !== null && subtotal >= freeShippingThreshold

  const announcementDismissible = announcementSection?.settings?.dismissible ?? theme.announcement?.dismissible ?? true
  useEffect(() => {
    if (!announcementDismissible) return
    try { setAnnouncementClosed(sessionStorage.getItem('focal-announcement-dismissed') === '1') } catch {}
  }, [announcementDismissible])

  // Escape key listener for modals/drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCart()
        setSearch(false)
        setMenu(false)
        setDesktopSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeCart])

  const openDesktopSearch = () => {
    if (desktopSearchBlurTimer.current) clearTimeout(desktopSearchBlurTimer.current)
    setDesktopSearchOpen(true)
  }
  const closeDesktopSearchDeferred = () => {
    desktopSearchBlurTimer.current = setTimeout(() => setDesktopSearchOpen(false), 150)
  }

  // Live predictive search debounce
  useEffect(() => {
    if ((!search && !desktopSearchOpen) || !searchQuery.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(searchQuery.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(Array.isArray(data) ? data.slice(0, 6) : [])
        }
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [search, desktopSearchOpen, searchQuery])

  const tree = useMemo(() => buildTree(navigation || []), [navigation])
  const money = (v: number) => `${theme.currency || 'USD'} ${(v / 100).toFixed(2)}`
  const transparent = headerSettings.transparent === true || (headerSettings.transparentHome === true && pathname === '/')
  const announcementPosition = announcementSection?.settings?.position ?? theme.announcement?.position ?? 'above'
  const dismissAnnouncement = () => { setAnnouncementClosed(true); try { sessionStorage.setItem('focal-announcement-dismissed', '1') } catch {} }

  const toggleMobile = (id: string) => setMobileOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  if (!headerEnabled) return announcementEnabled ? <><style dangerouslySetInnerHTML={{ __html: css }} /><AnnouncementBar theme={theme} announcementSection={announcementSection} closed={announcementClosed} onDismiss={dismissAnnouncement}/></> : null

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    {announcementEnabled && announcementPosition !== 'below' && <AnnouncementBar theme={theme} announcementSection={announcementSection} closed={announcementClosed} onDismiss={dismissAnnouncement}/>}

    <header className="focalNav" style={{ background: transparent ? 'transparent' : theme.colors.surface, borderColor: theme.colors.border, position: headerSettings.sticky ? 'sticky' : 'relative', top: 0 }}>
      <div className="focalNavInner focalContainer">
        <button className="focalNavMobile" aria-label="Menu" onClick={() => setMenu(true)}><Menu size={19}/></button>
        <Link href="/" className="focalLogo" style={{ fontFamily: theme.typography.heading }}>{theme.logoUrl ? <img src={theme.logoUrl} alt={theme.brandName} style={{ maxWidth: headerSettings.logoWidth || 160 }} /> : <span>{theme.brandName}</span>}</Link>
        {headerSettings.showSearch !== false && (
          <form className="aliNavSearchWrap" action="/shop" method="GET" onSubmit={() => setDesktopSearchOpen(false)}>
            <div className="aliNavSearchBar">
              <input
                name="q"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={openDesktopSearch}
                onBlur={closeDesktopSearchDeferred}
                placeholder="Search products, collections, or materials..."
                aria-label="Search store"
              />
              <button type="submit" className="aliNavSearchSubmit"><Search size={15}/> Search</button>
            </div>
            {desktopSearchOpen && (
              <div className="aliNavSearchDropdown" onMouseDown={e => e.preventDefault()}>
                {searchLoading && <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>Searching catalog…</div>}
                {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                  <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>No products found for &ldquo;{searchQuery}&rdquo;.</div>
                )}
                {!searchLoading && searchResults.map(p => (
                  <Link key={p.id} href={`/product/${p.slug}`} className="focalSearchItem" onClick={() => setDesktopSearchOpen(false)}>
                    <img src={p.images?.[0]?.url || '/placeholder-product.svg'} alt={p.name} />
                    <div className="focalSearchItemInfo">
                      <strong>{p.name}</strong>
                      <small>{p.category?.name || p.vendor || 'In stock'}</small>
                    </div>
                    <div className="focalSearchItemPrice">{money(p.basePrice || 0)}</div>
                  </Link>
                ))}
                {!searchQuery.trim() && (
                  <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>
                    Type a product name or keyword above to find items instantly.
                  </div>
                )}
              </div>
            )}
          </form>
        )}
        <div className="focalNavActions">
          {headerSettings.showSearch !== false && <button className="focalNavIcon aliNavSearchIconMobile" onClick={() => { setSearch(true); setSearchQuery('') }} aria-label="Search"><Search size={18}/></button>}
          {headerSettings.showAccount !== false && <Link className="focalNavIcon" href="/account" aria-label="Account"><UserRound size={18}/></Link>}
          {headerSettings.showWishlist && <Link className="focalNavIcon" href="/wishlist" aria-label="Wishlist"><Heart size={18}/></Link>}
          {headerSettings.showCart !== false && <button className="focalNavIcon" onClick={openCart} aria-label={`Cart with ${count} items`}><ShoppingBag size={18}/>{count > 0 && <span className="focalCartCount">{count > 99 ? '99+' : count}</span>}</button>}
        </div>
      </div>
      <div className="focalNavSecondary focalContainer">
        <div className="focalNavSecondaryInner">
          <nav className="focalNavLinks" aria-label="Main navigation">
            {tree.map(item => <DesktopNode key={item.id} item={item} openId={openId} setOpenId={setOpenId} />)}
          </nav>
        </div>
      </div>
    </header>
    {announcementEnabled && announcementPosition === 'below' && <AnnouncementBar theme={theme} announcementSection={announcementSection} closed={announcementClosed} onDismiss={dismissAnnouncement}/>}

    {/* PREDICTIVE LIVE SEARCH OVERLAY */}
    {search && <div className="focalSearchOverlay" onClick={() => setSearch(false)}>
      <div className="focalSearchCard" onClick={e => e.stopPropagation()}>
        <div className="focalSearchHeader">
          <Search size={18} color="var(--focal-muted)"/>
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products, collections, or materials..."
            aria-label="Search store"
          />
          {searchQuery && <button className="focalCartDeleteBtn" onClick={() => setSearchQuery('')} aria-label="Clear"><X size={15}/></button>}
          <button className="focalNavIcon" onClick={() => setSearch(false)} aria-label="Close search"><X size={16}/></button>
        </div>
        <div className="focalSearchChips">
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--focal-muted)', alignSelf: 'center', marginRight: 4 }}>POPULAR:</span>
          {['All Products', 'Essentials', 'Home', 'Care', 'Starter Kit'].map(tag => (
            <button
              key={tag}
              type="button"
              className="focalSearchChip"
              onClick={() => setSearchQuery(tag === 'All Products' ? '' : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="focalSearchResults">
          {searchLoading && <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>Searching catalog…</div>}
          {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>No products found for &ldquo;{searchQuery}&rdquo;. Try another term or explore our catalog.</div>
          )}
          {!searchLoading && searchResults.map(p => (
            <Link key={p.id} href={`/product/${p.slug}`} className="focalSearchItem" onClick={() => setSearch(false)}>
              <img src={p.images?.[0]?.url || '/placeholder-product.svg'} alt={p.name} />
              <div className="focalSearchItemInfo">
                <strong>{p.name}</strong>
                <small>{p.category?.name || p.vendor || 'In stock'}</small>
              </div>
              <div className="focalSearchItemPrice">{money(p.basePrice || 0)}</div>
            </Link>
          ))}
          {!searchQuery.trim() && (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--focal-muted)' }}>
              Type a product name or keyword above to find items instantly.
            </div>
          )}
        </div>
      </div>
    </div>}

    {/* ANIMATED SLIDE-OUT CART DRAWER */}
    {isCartOpen && <div className="focalCartOverlay" onClick={closeCart}>
      <aside className="focalCartDrawer" onClick={e => e.stopPropagation()} role="dialog" aria-label="Shopping Cart">
        <div className="focalCartHead">
          <div className="focalCartHeadTitle">
            <strong>Shopping Cart</strong>
            <span className="focalCartHeadBadge">{count} {count === 1 ? 'item' : 'items'}</span>
          </div>
          <button className="focalNavIcon" onClick={closeCart} aria-label="Close cart"><X size={17}/></button>
        </div>

        {/* FREE SHIPPING PROGRESS BAR -- hidden until the real threshold has loaded, so it
            never flashes a wrong (hardcoded) state before the actual setting is known. */}
        {freeShippingThreshold !== null && (
          <div className={`focalShippingMeter ${freeShippingUnlocked ? 'isUnlocked' : ''}`}>
            <div className={`focalShippingText ${freeShippingUnlocked ? 'isUnlocked' : ''}`}>
              {freeShippingUnlocked ? (
                <><Sparkles size={15} color="#16a34a"/> <span>You&apos;ve unlocked <strong>FREE standard shipping!</strong></span></>
              ) : (
                <><Truck size={15} color="var(--focal-primary)"/> <span>Add <strong>{money(remainingForFreeShipping)}</strong> more to unlock <strong>FREE Shipping</strong></span></>
              )}
            </div>
            <div className="focalShippingTrack" role="progressbar" aria-valuenow={shippingProgress} aria-valuemin={0} aria-valuemax={100}>
              <div className={`focalShippingBar ${freeShippingUnlocked ? 'isUnlocked' : ''}`} style={{ width: `${shippingProgress}%` }} />
            </div>
          </div>
        )}

        {items.length ? <>
          <div className="focalCartItems">
            {items.map(item => (
              <div className="focalCartItem" key={keyOf(item)}>
                <img src={item.image || '/placeholder-product.svg'} alt={item.name}/>
                <div className="focalCartInfo">
                  <strong>{item.name}</strong>
                  <small>{money(item.price)}</small>
                  <div className="focalCartQty">
                    <button onClick={() => updateQty(keyOf(item), item.quantity - 1)} aria-label="Decrease quantity"><Minus size={11}/></button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQty(keyOf(item), item.quantity + 1)} aria-label="Increase quantity"><Plus size={11}/></button>
                  </div>
                </div>
                <button className="focalCartDeleteBtn" onClick={() => removeItem(keyOf(item))} aria-label={`Remove ${item.name}`}><Trash2 size={15}/></button>
              </div>
            ))}
          </div>

          <div className="focalCartFoot">
            <div className="focalCartTotal">
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div className="focalCartTaxNote">Taxes and shipping calculated at checkout</div>
            <div className="focalCartActions">
              <Link className="focalButton primary wide" href="/checkout" onClick={closeCart} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Proceed to Checkout <ArrowRight size={16}/>
              </Link>
              <Link className="focalButton secondary wide" href="/cart" onClick={closeCart}>
                View Full Cart
              </Link>
            </div>
          </div>
        </> : (
          <div className="focalCartEmpty">
            <div className="focalCartEmptyIcon"><ShoppingBag size={28}/></div>
            <strong style={{ fontSize: 16, color: 'var(--focal-ink)' }}>Your cart is empty</strong>
            <p style={{ fontSize: 13, maxWidth: '28ch', margin: '0 auto', lineHeight: 1.5 }}>
              Discover our signature essentials and premium collections.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link className="focalButton primary" href="/shop" onClick={closeCart}>
                Explore All Products <ArrowRight size={15}/>
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>}

    {menu && <div className="focalMobileOverlay" onClick={() => setMenu(false)}>
      <div className="focalMobilePanel" onClick={e => e.stopPropagation()}>
        <div className="focalSearchTop">
          <strong>{theme.brandName}</strong>
          <button className="focalNavIcon" onClick={() => setMenu(false)} aria-label="Close menu"><X size={17}/></button>
        </div>
        {tree.map(item => <MobileNode key={item.id} item={item} mobileOpen={mobileOpen} toggle={toggleMobile} close={() => setMenu(false)}/>)}
      </div>
    </div>}
  </>
}

function MobileNode({ item, mobileOpen, toggle, close, depth = 0 }: { item: TreeItem; mobileOpen: Set<string>; toggle: (id: string) => void; close: () => void; depth?: number }) {
  const open = mobileOpen.has(item.id)
  const childClass = depth === 0 ? 'focalMobileChild' : 'focalMobileChild level2'
  return <div>
    <div className="focalMobileRow">
      <Link href={item.url || '#'} onClick={close}>{item.label}</Link>
      {item.children.length > 0 && <button className="focalMobileToggle" aria-label={`Toggle ${item.label}`} onClick={() => toggle(item.id)}>{open ? <Minus size={15}/> : <Plus size={15}/>}</button>}
    </div>
    {open && item.children.length > 0 && <div className="focalMobileChildren">{item.children.map(child => <div key={child.id}><Link className={childClass} href={child.url || '#'} onClick={close}>{child.label}</Link>{child.children.length > 0 && <div className="focalMobileChildren">{child.children.map(grand => <Link key={grand.id} className="focalMobileChild level2" href={grand.url || '#'} onClick={close}>{grand.label}</Link>)}</div>}</div>)}</div>}
  </div>
}
