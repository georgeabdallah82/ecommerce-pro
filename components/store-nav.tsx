'use client'

import { Search, ShoppingBag, UserRound, ChevronDown, Menu, X, Heart, Minus, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCart, keyOf } from './cart-provider'

type NavItem = { id: string; label: string; url?: string | null; parentId?: string | null; children?: NavItem[] }

const navCss = `.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:focalNavIn .62s cubic-bezier(.22,1,.36,1) both;transition:background .35s ease,border-color .35s ease,box-shadow .35s ease}.focalNavInner{height:76px;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:38px}.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;animation:focalLogoIn .72s cubic-bezier(.22,1,.36,1) .06s both;transition:transform .25s ease,opacity .25s ease}.focalLogo:hover{transform:translateY(-1px) scale(1.015);opacity:.9}.focalLogo img{display:block;height:auto;max-height:52px;object-fit:contain;background:transparent!important;border:0!important;box-shadow:none!important}.focalNavLinks{display:flex;justify-content:flex-start;gap:30px;height:100%;animation:focalLinksIn .7s cubic-bezier(.22,1,.36,1) .12s both}.focalNavItem{position:relative;display:flex;align-items:center}.focalNavLinks>a,.focalNavItem>a,.focalNavLinkButton{position:relative;border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:100%;padding:0;transition:color .22s ease,transform .22s ease}.focalNavLinks>a:after,.focalNavItem>a:after,.focalNavLinkButton:after{content:"";position:absolute;left:0;right:0;bottom:20px;height:2px;border-radius:99px;background:currentColor;transform:scaleX(0);transform-origin:center;transition:transform .28s cubic-bezier(.22,1,.36,1)}.focalNavLinks>a:hover,.focalNavItem>a:hover,.focalNavLinkButton:hover{transform:translateY(-1px)}.focalNavLinks>a:hover:after,.focalNavItem>a:hover:after,.focalNavLinkButton:hover:after{transform:scaleX(1)}.focalMega{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%) translateY(-8px) scale(.98);transform-origin:top center;width:620px;background:rgba(255,255,255,.98);border:1px solid var(--focal-line);border-radius:0 0 18px 18px;box-shadow:0 18px 50px rgba(25,21,18,.12);padding:20px}.focalMegaGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.focalMegaGrid a{padding:12px;border-radius:10px;font-size:12px;font-weight:750}.focalMegaGrid a:hover{background:var(--focal-soft);color:var(--focal-primary)}.focalNavActions{display:flex;gap:8px;align-items:center}.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer;transition:transform .22s ease,box-shadow .22s ease,background .22s ease,border-color .22s ease}.focalNavIcon:hover{transform:translateY(-2px) scale(1.025);box-shadow:0 8px 22px rgba(25,21,18,.10)}.focalNavIcon:active{transform:scale(.94)}.focalCartCount{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:999px;background:var(--focal-primary);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px}.focalNavMobile{display:none;width:42px;height:42px;border:1px solid var(--focal-line);background:#fff;border-radius:12px;place-items:center}.focalAnnouncementGlobal{background:var(--focal-primary);color:#fff;animation:focalAnnouncementIn .55s cubic-bezier(.22,1,.36,1) both}.focalAnnouncementGlobalInner{min-height:40px;display:flex;align-items:center;justify-content:center;gap:15px;padding:0 16px;font-size:12px;font-weight:850}.focalAnnouncementGlobalInner a{text-decoration:underline;text-underline-offset:3px}.focalAnnouncementDismiss{border:0;background:transparent;color:inherit;opacity:.8;cursor:pointer}.focalSearchOverlay,.focalMobileOverlay,.focalCartOverlay{position:fixed;inset:0;z-index:100;background:rgba(25,21,18,.28);backdrop-filter:blur(8px);animation:focalOverlayIn .25s ease both}.focalSearchOverlay,.focalMobileOverlay{display:grid;place-items:start center}.focalSearchCard{width:min(760px,calc(100% - 24px));margin-top:80px;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.2);padding:20px;animation:focalSearchIn .42s cubic-bezier(.22,1,.36,1) both}.focalSearchTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.focalSearchForm{display:grid;grid-template-columns:1fr auto;gap:8px}.focalSearchForm input{height:52px;border:1px solid var(--focal-line);border-radius:12px;padding:0 14px;outline:none}.focalMobilePanel{margin-left:auto;width:min(390px,88%);height:100%;background:#fff;padding:20px;overflow:auto;animation:focalDrawerIn .38s cubic-bezier(.22,1,.36,1) both}.focalMobileGroup{display:grid;border-top:1px solid var(--focal-line);padding:14px 0}.focalMobileGroup>a{font-size:16px;font-weight:850}.focalMobileGroup>a.sub{padding:9px 0 0 12px;font-size:13px;color:var(--focal-muted)}.focalCartOverlay{display:flex;justify-content:flex-end}.focalCartDrawer{width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.18);animation:focalDrawerIn .38s cubic-bezier(.22,1,.36,1) both}.focalCartHead{display:flex;align-items:center;justify-content:space-between;padding:18px;border-bottom:1px solid var(--focal-line)}.focalCartItems{flex:1;overflow:auto;padding:14px}.focalCartItem{display:grid;grid-template-columns:80px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--focal-line)}.focalCartItem img{width:80px;height:94px;object-fit:cover;border-radius:10px;background:#f4efe9}.focalCartInfo{display:grid;gap:4px;align-content:start}.focalCartInfo strong{font-size:13px}.focalCartInfo small{color:var(--focal-muted)}.focalCartQty{display:flex;align-items:center;gap:6px}.focalCartQty button{width:26px;height:26px;border:1px solid var(--focal-line);background:#fff;border-radius:7px;display:grid;place-items:center;cursor:pointer}.focalCartFoot{border-top:1px solid var(--focal-line);padding:16px}.focalCartTotal{display:flex;justify-content:space-between;font-weight:900;margin-bottom:12px}.focalCartEmpty{padding:40px 18px;text-align:center;color:var(--focal-muted)}@media(max-width:900px){.focalNavInner{grid-template-columns:auto 1fr auto;gap:12px}.focalNavMobile{display:grid}.focalNavLinks{display:none}.focalLogo{justify-content:center}.focalNavActions .focalNavIcon:nth-child(2){display:none}.focalMegaGrid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}.focalAnnouncementGlobalInner{font-size:11px;min-height:38px}.focalSearchForm{grid-template-columns:1fr}.focalCartItem{grid-template-columns:64px 1fr auto}.focalCartItem img{width:64px;height:76px}}`

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

export function StoreNav({ theme, navigation }: { theme: any; navigation: NavItem[] }) {
  const pathname = usePathname() || '/'
  const templateKey = templateForPath(pathname)
  const template = Array.isArray(theme.editorTemplates?.[templateKey]) ? theme.editorTemplates[templateKey] : null
  const headerSection = template?.find((s: any) => s.type === 'header')
  const announcementSection = template?.find((s: any) => s.type === 'announcement')
  const headerSettings = { ...(theme.header || {}), ...(headerSection?.settings || {}) }
  const headerEnabled = theme.header?.enabled !== false && headerSection?.enabled !== false
  const announcementEnabled = theme.announcement?.enabled !== false && announcementSection?.enabled !== false && announcementSection?.settings?.enabled !== false
  const { items, updateQty, removeItem, subtotal, count } = useCart()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [cart, setCart] = useState(false)
  const [openMega, setOpenMega] = useState<string | null>(null)
  const [announcementClosed, setAnnouncementClosed] = useState(false)

  useEffect(() => {
    if (!theme.announcement?.dismissible) return
    try { setAnnouncementClosed(sessionStorage.getItem('focal-announcement-dismissed') === '1') } catch {}
  }, [theme.announcement?.dismissible])

  useEffect(() => {
    const locked = menu || search || cart
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menu, search, cart])

  const tree = useMemo(() => navigation.filter(x => !x.parentId).map(x => ({ ...x, children: Array.isArray(x.children) ? x.children : navigation.filter(c => c.parentId === x.id) })), [navigation])
  const money = (v: number) => `${theme.currency || 'USD'} ${(v / 100).toFixed(2)}`
  const transparent = headerSettings.transparent === true || (headerSettings.transparentHome === true && pathname === '/')
  const announcementText = announcementSection?.settings?.text || theme.announcement?.text || 'Free shipping on orders over $50'
  const announcementLink = announcementSection?.settings?.link
  const isItemActive = (url?: string | null) => {
    if (!url || !url.startsWith('/')) return false
    if (url === '/') return pathname === '/'
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  if (!headerEnabled) {
    if (!announcementEnabled || announcementClosed) return null
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: navCss }} />
        <div className="focalAnnouncementGlobal">
          <div className="focalAnnouncementGlobalInner">
            <span>{announcementText}</span>
            {announcementLink && <Link href={announcementLink}>Learn more</Link>}
            <button className="focalAnnouncementDismiss" aria-label="Dismiss announcement" onClick={() => { setAnnouncementClosed(true); try { sessionStorage.setItem('focal-announcement-dismissed', '1') } catch {} }}>
              <X size={13} />
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: navCss }} />
      {announcementEnabled && !announcementClosed && (
        <div className="focalAnnouncementGlobal">
          <div className="focalAnnouncementGlobalInner">
            <span>{announcementText}</span>
            {announcementLink && <Link href={announcementLink}>Learn more</Link>}
            {theme.announcement?.dismissible && (
              <button className="focalAnnouncementDismiss" aria-label="Dismiss announcement" onClick={() => { setAnnouncementClosed(true); try { sessionStorage.setItem('focal-announcement-dismissed', '1') } catch {} }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      <header className="focalNav" style={{ background: transparent ? 'transparent' : theme.colors.surface, borderColor: theme.colors.border, position: headerSettings.sticky ? 'sticky' : 'relative', top: 0 }}>
        <div className="focalNavInner focalContainer">
          <button className="focalNavMobile" aria-label="Open menu" aria-expanded={menu} onClick={() => { setMenu(true); setOpenMega(null) }}><Menu size={19} /></button>
          <Link href="/" className="focalLogo" style={{ fontFamily: theme.typography.heading }} aria-label={`${theme.brandName} home`}>
            {theme.logoUrl ? <img src={theme.logoUrl} alt={theme.brandName} width={160} height={52} fetchPriority="high" decoding="async" /> : <span>{theme.brandName}</span>}
          </Link>
          <nav className="focalNavLinks" aria-label="Primary navigation">
            {tree.map(item => {
              const active = isItemActive(item.url) || Boolean(item.children?.some(child => isItemActive(child.url)))
              return <div className="focalNavItem" key={item.id} onMouseEnter={() => item.children?.length && setOpenMega(item.id)} onMouseLeave={() => setOpenMega(null)}>
                {item.children?.length ? (
                  <>
                    <button className="focalNavLinkButton" aria-expanded={openMega === item.id} aria-haspopup="true" onClick={() => setOpenMega(openMega === item.id ? null : item.id)} aria-current={active ? 'page' : undefined}>{item.label}<ChevronDown size={13} /></button>
                    {openMega === item.id && <div className="focalMega"><div className="focalMegaGrid">{item.children.map(child => <Link href={child.url || '#'} key={child.id} aria-current={isItemActive(child.url) ? 'page' : undefined}>{child.label}</Link>)}</div></div>}
                  </>
                ) : <Link href={item.url || '#'} aria-current={active ? 'page' : undefined}>{item.label}</Link>}
              </div>
            })}
          </nav>
          <div className="focalNavActions">
            {headerSettings.showSearch !== false && <button className="focalNavIcon" onClick={() => setSearch(true)} aria-label="Search"><Search size={18} /></button>}
            {headerSettings.showAccount !== false && <Link className="focalNavIcon" href="/account" aria-label="Account"><UserRound size={18} /></Link>}
            {headerSettings.showWishlist && <Link className="focalNavIcon" href="/wishlist" aria-label="Wishlist"><Heart size={18} /></Link>}
            {headerSettings.showCart !== false && <button className="focalNavIcon" onClick={() => setCart(true)} aria-label={`Cart with ${count} items`}><ShoppingBag size={18} />{count > 0 && <span className="focalCartCount">{count > 99 ? '99+' : count}</span>}</button>}
          </div>
        </div>
      </header>

      {search && <div className="focalSearchOverlay" onClick={() => setSearch(false)}><div className="focalSearchCard" role="dialog" aria-modal="true" aria-label="Search the store" onClick={e => e.stopPropagation()}><div className="focalSearchTop"><strong>Search the store</strong><button className="focalNavIcon" aria-label="Close search" onClick={() => setSearch(false)}><X size={17} /></button></div><form action="/shop" className="focalSearchForm"><input autoFocus name="q" placeholder="Search products, collections..." /><button className="focalButton primary" type="submit">Search</button></form></div></div>}

      {cart && <div className="focalCartOverlay" onClick={() => setCart(false)}><aside className="focalCartDrawer" role="dialog" aria-modal="true" aria-label="Shopping cart" onClick={e => e.stopPropagation()}><div className="focalCartHead"><div><strong>Cart</strong><div style={{ fontSize: 10, color: 'var(--focal-muted)', marginTop: 3 }}>{count} items</div></div><button className="focalNavIcon" aria-label="Close cart" onClick={() => setCart(false)}><X size={17} /></button></div>{items.length ? <><div className="focalCartItems">{items.map(item => <div className="focalCartItem" key={keyOf(item)}><img src={item.image || '/placeholder-product.svg'} alt="" width={80} height={94} loading="lazy" decoding="async" /><div className="focalCartInfo"><strong>{item.name}</strong><small>{money(item.price)}</small><div className="focalCartQty"><button aria-label={`Decrease ${item.name}`} onClick={() => updateQty(keyOf(item), item.quantity - 1)}><Minus size={12} /></button><span>{item.quantity}</span><button aria-label={`Increase ${item.name}`} onClick={() => updateQty(keyOf(item), item.quantity + 1)}><Plus size={12} /></button></div></div><button className="focalNavIcon" onClick={() => removeItem(keyOf(item))} aria-label={`Remove ${item.name}`}><Trash2 size={13} /></button></div>)}</div><div className="focalCartFoot"><div className="focalCartTotal"><span>Subtotal</span><span>{money(subtotal)}</span></div><Link className="focalButton primary wide" href="/checkout">Checkout</Link><Link className="focalButton secondary wide" href="/cart" onClick={() => setCart(false)}>View cart</Link></div></> : <div className="focalCartEmpty"><div style={{ fontWeight: 850, color: 'var(--focal-ink)', fontSize: 16 }}>Your cart is empty</div><div style={{ marginTop: 6 }}>Add a product and it will appear here.</div><div style={{ marginTop: 14 }}><Link className="focalButton primary" href="/shop" onClick={() => setCart(false)}>Continue shopping</Link></div></div>}</aside></div>}

      {menu && <div className="focalMobileOverlay" onClick={() => setMenu(false)}><div className="focalMobilePanel" role="dialog" aria-modal="true" aria-label="Mobile menu" onClick={e => e.stopPropagation()}><div className="focalSearchTop"><strong>{theme.brandName}</strong><button className="focalNavIcon" aria-label="Close menu" onClick={() => setMenu(false)}><X size={17} /></button></div>{tree.map(item => <div key={item.id} className="focalMobileGroup"><Link href={item.url || '#'} aria-current={isItemActive(item.url) ? 'page' : undefined} onClick={() => setMenu(false)}>{item.label}</Link>{item.children?.map(c => <Link className="sub" href={c.url || '#'} aria-current={isItemActive(c.url) ? 'page' : undefined} key={c.id} onClick={() => setMenu(false)}>{c.label}</Link>)}</div>)}</div></div>}
    </>
  )
}
