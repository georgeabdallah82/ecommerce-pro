'use client'

import { ChevronDown, Heart, Menu, Minus, Plus, Search, ShoppingBag, Trash2, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { keyOf, useCart } from './cart-provider'

type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null }

type TreeItem = NavItem & { children: TreeItem[] }

const css = `
.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.focalNavInner{height:76px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px}
.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
.focalLogo img{display:block;height:auto;max-height:52px;object-fit:contain;background:transparent!important;border:0!important;box-shadow:none!important}
.focalNavLinks{display:flex;justify-content:center;gap:24px;height:100%}
.focalNavItem{position:relative;display:flex;align-items:center;height:100%}
.focalNavLink{border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;height:100%;padding:0}
.focalNavLink a{color:inherit;text-decoration:none}
.focalNavChevron{width:28px;height:28px;display:grid;place-items:center;border:0;background:transparent;cursor:pointer;color:inherit;opacity:.7}
.focalDropdown{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);min-width:250px;background:rgba(255,255,255,.98);border:1px solid var(--focal-line);border-radius:14px;box-shadow:0 20px 50px rgba(25,21,18,.14);padding:8px;backdrop-filter:blur(18px)}
.focalDropdownItem{position:relative}
.focalDropdownLink{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:9px;color:var(--focal-ink);text-decoration:none;font-size:12px;font-weight:750}
.focalDropdownLink:hover{background:var(--focal-soft);color:var(--focal-primary)}
.focalDropdownNested{position:absolute;left:calc(100% + 8px);top:-8px;min-width:230px;background:#fff;border:1px solid var(--focal-line);border-radius:14px;box-shadow:0 18px 46px rgba(25,21,18,.14);padding:8px}
.focalNavActions{display:flex;gap:8px;align-items:center}
.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer}
.focalCartCount{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:999px;background:var(--focal-primary);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px}
.focalNavMobile{display:none;width:42px;height:42px;border:1px solid var(--focal-line);background:#fff;border-radius:12px;place-items:center}
.focalAnnouncementGlobal{background:var(--focal-primary);color:#fff}.focalAnnouncementGlobalInner{min-height:40px;display:flex;align-items:center;justify-content:center;gap:15px;padding:0 16px;font-size:12px;font-weight:850}.focalAnnouncementGlobalInner a{text-decoration:underline;text-underline-offset:3px}.focalAnnouncementDismiss{border:0;background:transparent;color:inherit;opacity:.8;cursor:pointer}
.focalSearchOverlay,.focalMobileOverlay,.focalCartOverlay{position:fixed;inset:0;z-index:100;background:rgba(25,21,18,.28);backdrop-filter:blur(8px)}
.focalSearchOverlay,.focalMobileOverlay{display:grid;place-items:start center}.focalSearchCard{width:min(760px,calc(100% - 24px));margin-top:80px;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.2);padding:20px}.focalSearchTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.focalSearchForm{display:grid;grid-template-columns:1fr auto;gap:8px}.focalSearchForm input{height:52px;border:1px solid var(--focal-line);border-radius:12px;padding:0 14px;outline:none}
.focalMobilePanel{margin-left:auto;width:min(390px,88%);height:100%;background:#fff;padding:20px;overflow:auto}.focalMobileRow{display:flex;align-items:center;gap:6px;border-top:1px solid var(--focal-line);padding:12px 0}.focalMobileRow>a{font-size:16px;font-weight:850;color:var(--focal-ink);text-decoration:none;flex:1}.focalMobileToggle{width:34px;height:34px;border:1px solid var(--focal-line);border-radius:9px;background:#fff;display:grid;place-items:center;cursor:pointer}.focalMobileChildren{display:grid;padding:0 0 6px 12px}.focalMobileChild{padding:8px 0;font-size:13px;color:var(--focal-muted);text-decoration:none}.focalMobileChild.level2{padding-left:12px;font-size:12px}
.focalCartOverlay{display:flex;justify-content:flex-end}.focalCartDrawer{width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.18)}.focalCartHead{display:flex;align-items:center;justify-content:space-between;padding:18px;border-bottom:1px solid var(--focal-line)}.focalCartItems{flex:1;overflow:auto;padding:14px}.focalCartItem{display:grid;grid-template-columns:80px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--focal-line)}.focalCartItem img{width:80px;height:94px;object-fit:cover;border-radius:10px;background:#f4efe9}.focalCartInfo{display:grid;gap:4px;align-content:start}.focalCartInfo strong{font-size:13px}.focalCartInfo small{color:var(--focal-muted)}.focalCartQty{display:flex;align-items:center;gap:6px}.focalCartQty button{width:26px;height:26px;border:1px solid var(--focal-line);background:#fff;border-radius:7px;display:grid;place-items:center;cursor:pointer}.focalCartFoot{border-top:1px solid var(--focal-line);padding:16px}.focalCartTotal{display:flex;justify-content:space-between;font-weight:900;margin-bottom:12px}.focalCartEmpty{padding:40px 18px;text-align:center;color:var(--focal-muted)}
@media(max-width:900px){.focalNavInner{grid-template-columns:auto 1fr auto;gap:12px}.focalNavMobile{display:grid}.focalNavLinks{display:none}.focalLogo{justify-content:center}.focalNavActions .focalNavIcon:nth-child(2){display:none}}
@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}.focalAnnouncementGlobalInner{font-size:11px;min-height:38px}.focalSearchForm{grid-template-columns:1fr}.focalCartItem{grid-template-columns:64px 1fr auto}.focalCartItem img{width:64px;height:76px}}
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
  const { items, updateQty, removeItem, subtotal, count } = useCart()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [cart, setCart] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState<Set<string>>(new Set())
  const [announcementClosed, setAnnouncementClosed] = useState(false)

  useEffect(() => {
    if (!theme.announcement?.dismissible) return
    try { setAnnouncementClosed(sessionStorage.getItem('focal-announcement-dismissed') === '1') } catch {}
  }, [theme.announcement?.dismissible])

  const tree = useMemo(() => buildTree(navigation || []), [navigation])
  const money = (v: number) => `${theme.currency || 'USD'} ${(v / 100).toFixed(2)}`
  const transparent = headerSettings.transparent === true || (headerSettings.transparentHome === true && pathname === '/')
  const announcementText = announcementSection?.settings?.text || theme.announcement?.text || 'Free shipping on orders over $50'
  const announcementLink = announcementSection?.settings?.link

  const toggleMobile = (id: string) => setMobileOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  if (!headerEnabled) return announcementEnabled && !announcementClosed ? <><style dangerouslySetInnerHTML={{ __html: css }} /><div className="focalAnnouncementGlobal"><div className="focalAnnouncementGlobalInner"><span>{announcementText}</span>{announcementLink && <Link href={announcementLink}>Learn more</Link>}<button className="focalAnnouncementDismiss" onClick={() => { setAnnouncementClosed(true); try { sessionStorage.setItem('focal-announcement-dismissed', '1') } catch {} }}><X size={13}/></button></div></div></> : null

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    {announcementEnabled && !announcementClosed && <div className="focalAnnouncementGlobal"><div className="focalAnnouncementGlobalInner"><span>{announcementText}</span>{announcementLink && <Link href={announcementLink}>Learn more</Link>}{theme.announcement?.dismissible && <button className="focalAnnouncementDismiss" aria-label="Dismiss" onClick={() => { setAnnouncementClosed(true); try { sessionStorage.setItem('focal-announcement-dismissed', '1') } catch {} }}><X size={13}/></button>}</div></div>}

    <header className="focalNav" style={{ background: transparent ? 'transparent' : theme.colors.surface, borderColor: theme.colors.border, position: headerSettings.sticky ? 'sticky' : 'relative', top: 0 }}>
      <div className="focalNavInner focalContainer">
        <button className="focalNavMobile" aria-label="Menu" onClick={() => setMenu(true)}><Menu size={19}/></button>
        <Link href="/" className="focalLogo" style={{ fontFamily: theme.typography.heading }}>{theme.logoUrl ? <img src={theme.logoUrl} alt={theme.brandName} style={{ maxWidth: headerSettings.logoWidth || 160 }} /> : <span>{theme.brandName}</span>}</Link>
        <nav className="focalNavLinks" aria-label="Main navigation">
          {tree.map(item => <DesktopNode key={item.id} item={item} openId={openId} setOpenId={setOpenId} />)}
        </nav>
        <div className="focalNavActions">
          {headerSettings.showSearch !== false && <button className="focalNavIcon" onClick={() => setSearch(true)} aria-label="Search"><Search size={18}/></button>}
          {headerSettings.showAccount !== false && <Link className="focalNavIcon" href="/account" aria-label="Account"><UserRound size={18}/></Link>}
          {headerSettings.showWishlist && <Link className="focalNavIcon" href="/wishlist" aria-label="Wishlist"><Heart size={18}/></Link>}
          {headerSettings.showCart !== false && <button className="focalNavIcon" onClick={() => setCart(true)} aria-label={`Cart with ${count} items`}><ShoppingBag size={18}/>{count > 0 && <span className="focalCartCount">{count > 99 ? '99+' : count}</span>}</button>}
        </div>
      </div>
    </header>

    {search && <div className="focalSearchOverlay" onClick={() => setSearch(false)}><div className="focalSearchCard" onClick={e => e.stopPropagation()}><div className="focalSearchTop"><strong>Search the store</strong><button className="focalNavIcon" onClick={() => setSearch(false)}><X size={17}/></button></div><form action="/shop" className="focalSearchForm"><input autoFocus name="q" placeholder="Search products, collections..."/><button className="focalButton primary" type="submit">Search</button></form></div></div>}

    {cart && <div className="focalCartOverlay" onClick={() => setCart(false)}><aside className="focalCartDrawer" onClick={e => e.stopPropagation()}><div className="focalCartHead"><div><strong>Cart</strong><div style={{fontSize:10,color:'var(--focal-muted)',marginTop:3}}>{count} items</div></div><button className="focalNavIcon" onClick={() => setCart(false)}><X size={17}/></button></div>{items.length ? <><div className="focalCartItems">{items.map(item => <div className="focalCartItem" key={keyOf(item)}><img src={item.image || '/placeholder-product.svg'} alt=""/><div className="focalCartInfo"><strong>{item.name}</strong><small>{money(item.price)}</small><div className="focalCartQty"><button onClick={() => updateQty(keyOf(item), item.quantity - 1)}><Minus size={12}/></button><span>{item.quantity}</span><button onClick={() => updateQty(keyOf(item), item.quantity + 1)}><Plus size={12}/></button></div></div><button className="focalNavIcon" onClick={() => removeItem(keyOf(item))} aria-label="Remove"><Trash2 size={13}/></button></div>)}</div><div className="focalCartFoot"><div className="focalCartTotal"><span>Subtotal</span><span>{money(subtotal)}</span></div><Link className="focalButton primary wide" href="/checkout">Checkout</Link><Link className="focalButton secondary wide" href="/cart" onClick={() => setCart(false)}>View cart</Link></div></> : <div className="focalCartEmpty">Your cart is empty.<div style={{marginTop:14}}><Link className="focalButton primary" href="/shop" onClick={() => setCart(false)}>Continue shopping</Link></div></div>}</aside></div>}

    {menu && <div className="focalMobileOverlay"><div className="focalMobilePanel"><div className="focalSearchTop"><strong>{theme.brandName}</strong><button className="focalNavIcon" onClick={() => setMenu(false)}><X size={17}/></button></div>{tree.map(item => <MobileNode key={item.id} item={item} mobileOpen={mobileOpen} toggle={toggleMobile} close={() => setMenu(false)}/>)}</div></div>}
  </>
}

function MobileNode({ item, mobileOpen, toggle, close, depth = 0 }: { item: TreeItem; mobileOpen: Set<string>; toggle: (id: string) => void; close: () => void; depth?: number }) {
  const open = mobileOpen.has(item.id)
  const childClass = depth === 0 ? 'focalMobileChild' : 'focalMobileChild level2'
  return <div><div className="focalMobileRow"><Link href={item.url || '#'} onClick={close}>{item.label}</Link>{item.children.length > 0 && <button className="focalMobileToggle" aria-label={`Toggle ${item.label}`} onClick={() => toggle(item.id)}>{open ? <Minus size={15}/> : <Plus size={15}/>}</button>}</div>{open && item.children.length > 0 && <div className="focalMobileChildren">{item.children.map(child => <div key={child.id}><Link className={childClass} href={child.url || '#'} onClick={close}>{child.label}</Link>{child.children.length > 0 && <div className="focalMobileChildren">{child.children.map(grand => <Link key={grand.id} className="focalMobileChild level2" href={grand.url || '#'} onClick={close}>{grand.label}</Link>)}</div>}</div>)}</div>}</div>
}
