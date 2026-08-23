'use client'

import Link from 'next/link'
import {Search,ShoppingBag,UserRound,ChevronDown,Menu,X,Heart} from 'lucide-react'
import {useMemo,useState} from 'react'
import {useCart} from './cart-provider'

type NavItem={id:string;label:string;url?:string|null;parentId?:string|null;children?:NavItem[]}

const navCss=`.focalNav{z-index:50;border-bottom:1px solid var(--focal-line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.focalNavInner{height:76px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px}.focalLogo{font-size:22px;font-weight:900;letter-spacing:-.045em;display:flex;align-items:center}.focalLogo img{display:block;height:auto}.focalNavLinks{display:flex;justify-content:center;gap:24px;height:100%}.focalNavItem{position:relative;display:flex;align-items:center}.focalNavLinks>a,.focalNavItem>a,.focalNavLinkButton{border:0;background:transparent;color:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:100%;padding:0}.focalMega{position:absolute;top:100%;left:50%;transform:translateX(-50%);width:520px;background:rgba(255,255,255,.98);border:1px solid var(--focal-line);border-radius:0 0 18px 18px;box-shadow:0 18px 50px rgba(25,21,18,.12);padding:20px}.focalMegaGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}.focalMegaGrid a{padding:12px;border-radius:10px;font-size:12px;font-weight:750}.focalMegaGrid a:hover{background:var(--focal-soft);color:var(--focal-primary)}.focalNavActions{display:flex;gap:8px;align-items:center}.focalNavIcon{width:42px;height:42px;border:1px solid var(--focal-line);background:var(--focal-surface);color:var(--focal-ink);border-radius:12px;display:grid;place-items:center;position:relative;cursor:pointer}.focalCartCount{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:999px;background:var(--focal-primary);color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;padding:0 4px}.focalNavMobile{display:none;width:42px;height:42px;border:1px solid var(--focal-line);background:#fff;border-radius:12px;place-items:center}.focalSearchOverlay,.focalMobileOverlay{position:fixed;inset:0;z-index:100;background:rgba(25,21,18,.28);backdrop-filter:blur(8px);display:grid;place-items:start center}.focalSearchCard{width:min(720px,calc(100% - 24px));margin-top:80px;background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.2);padding:20px}.focalSearchTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.focalSearchForm{display:grid;grid-template-columns:1fr auto;gap:8px}.focalSearchForm input{height:52px;border:1px solid var(--focal-line);border-radius:12px;padding:0 14px;outline:none}.focalMobileOverlay{place-items:stretch}.focalMobilePanel{margin-left:auto;width:min(390px,88%);height:100%;background:#fff;padding:20px;overflow:auto}.focalMobileGroup{display:grid;border-top:1px solid var(--focal-line);padding:14px 0}.focalMobileGroup>a{font-size:16px;font-weight:850}.focalMobileGroup>a.sub{padding:9px 0 0 12px;font-size:13px;color:var(--focal-muted)}@media(max-width:900px){.focalNavInner{grid-template-columns:auto 1fr auto;gap:12px}.focalNavMobile{display:grid}.focalNavLinks{display:none}.focalLogo{justify-content:center}.focalNavActions{justify-content:flex-end}.focalNavActions .focalNavIcon:nth-child(2){display:none}}@media(max-width:600px){.focalNavInner{height:66px}.focalNavIcon{width:38px;height:38px}.focalLogo{font-size:18px}}
`

export function StoreNav({theme,navigation}:{theme:any;navigation:NavItem[]}){
  const {count}=useCart()
  const [menu,setMenu]=useState(false)
  const [search,setSearch]=useState(false)
  const [openMega,setOpenMega]=useState<string|null>(null)
  const tree=useMemo(()=>navigation.filter(x=>!x.parentId).map(x=>({...x,children:Array.isArray(x.children)?x.children:navigation.filter(c=>c.parentId===x.id)})),[navigation])
  return <>
    <style dangerouslySetInnerHTML={{__html:navCss}}/>
    <header className="focalNav" style={{background:theme.header.transparentHome?'rgba(255,250,246,.82)':theme.colors.surface,borderColor:theme.colors.border,position:theme.header.sticky?'sticky':'relative'}}>
      <div className="focalNavInner focalContainer">
        <button className="focalNavMobile" aria-label="Menu" onClick={()=>setMenu(true)}><Menu size={19}/></button>
        <Link href="/" className="focalLogo" style={{fontFamily:theme.typography.heading}}>{theme.logoUrl?<img src={theme.logoUrl} alt={theme.brandName} style={{maxWidth:theme.header.logoWidth||160}}/>:<span>{theme.brandName}</span>}</Link>
        <nav className="focalNavLinks">
          {tree.map(item=><div className="focalNavItem" key={item.id} onMouseEnter={()=>item.children?.length&&setOpenMega(item.id)} onMouseLeave={()=>setOpenMega(null)}>
            {item.children?.length?<><button className="focalNavLinkButton">{item.label}<ChevronDown size={13}/></button>{openMega===item.id&&<div className="focalMega"><div className="focalMegaGrid">{item.children.map(child=><Link href={child.url||'#'} key={child.id}>{child.label}</Link>)}</div></div>}</>:<Link href={item.url||'#'}>{item.label}</Link>}
          </div>)}
        </nav>
        <div className="focalNavActions">
          {theme.header.showSearch!==false&&<button className="focalNavIcon" onClick={()=>setSearch(true)} aria-label="Search"><Search size={18}/></button>}
          {theme.header.showAccount!==false&&<Link className="focalNavIcon" href="/account" aria-label="Account"><UserRound size={18}/></Link>}
          {theme.header.showWishlist&&<Link className="focalNavIcon" href="/wishlist" aria-label="Wishlist"><Heart size={18}/></Link>}
          {theme.header.showCart!==false&&<Link className="focalNavIcon" href="/cart" aria-label={`Cart with ${count} items`}><ShoppingBag size={18}/>{count>0&&<span className="focalCartCount">{count>99?'99+':count}</span>}</Link>}
        </div>
      </div>
    </header>

    {search&&<div className="focalSearchOverlay" onClick={()=>setSearch(false)}><div className="focalSearchCard" onClick={e=>e.stopPropagation()}><div className="focalSearchTop"><strong>Search the store</strong><button className="focalNavIcon" onClick={()=>setSearch(false)}><X size={17}/></button></div><form action="/shop" className="focalSearchForm"><input autoFocus name="q" placeholder="Search products, collections..."/><button className="focalButton primary" type="submit">Search</button></form></div></div>}

    {menu&&<div className="focalMobileOverlay"><div className="focalMobilePanel"><div className="focalSearchTop"><strong>{theme.brandName}</strong><button className="focalNavIcon" onClick={()=>setMenu(false)}><X size={17}/></button></div>{tree.map(item=><div key={item.id} className="focalMobileGroup"><Link href={item.url||'#'} onClick={()=>setMenu(false)}>{item.label}</Link>{item.children?.map(c=><Link className="sub" href={c.url||'#'} key={c.id} onClick={()=>setMenu(false)}>{c.label}</Link>)}</div>)}</div></div>}
  </>
}
