'use client'

import Link from 'next/link'
import {Search,ShoppingBag,UserRound,ChevronDown,Menu,X,Heart} from 'lucide-react'
import {useMemo,useState} from 'react'
import {useCart} from './cart-provider'

type NavItem={id:string;label:string;url?:string|null;parentId?:string|null;children?:NavItem[]}

export function StoreNav({theme,navigation}:{theme:any;navigation:NavItem[]}){
  const {count}=useCart()
  const [menu,setMenu]=useState(false)
  const [search,setSearch]=useState(false)
  const [openMega,setOpenMega]=useState<string|null>(null)
  const tree=useMemo(()=>navigation.filter(x=>!x.parentId).map(x=>({...x,children:Array.isArray(x.children)?x.children:navigation.filter(c=>c.parentId===x.id)})),[navigation])
  return <>
    <header className="focalNav" style={{background:theme.header.transparentHome?'rgba(255,250,246,.82)':theme.colors.surface,borderColor:theme.colors.border,position:theme.header.sticky?'sticky':'relative'}}>
      <div className="focalNavInner focalContainer">
        <button className="focalNavMobile" aria-label="Menu" onClick={()=>setMenu(true)}><Menu size={19}/></button>
        <Link href="/" className="focalLogo" style={{fontFamily:theme.typography.heading}}>{theme.logoUrl?<img src={theme.logoUrl} alt={theme.brandName} style={{maxWidth:theme.header.logoWidth||160}}/>:<span>{theme.brandName}</span>}</Link>
        <nav className="focalNavLinks">
          {tree.map(item=><div className="focalNavItem" key={item.id} onMouseEnter={()=>item.children?.length&&setOpenMega(item.id)} onMouseLeave={()=>setOpenMega(null)}>
            {item.children?.length||theme.header.megaMenu?<><button className="focalNavLinkButton">{item.label}<ChevronDown size={13}/></button>{item.children?.length&&openMega===item.id&&<div className="focalMega"><div className="focalMegaGrid">{item.children.map(child=><Link href={child.url||'#'} key={child.id}>{child.label}</Link>)}</div></div>}</>:<Link href={item.url||'#'}>{item.label}</Link>}
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

    {search&&<div className="focalSearchOverlay"><div className="focalSearchCard"><div className="focalSearchTop"><strong>Search the store</strong><button className="focalNavIcon" onClick={()=>setSearch(false)}><X size={17}/></button></div><form action="/shop" className="focalSearchForm"><input autoFocus name="q" placeholder="Search products, collections..."/><button className="focalButton primary" type="submit">Search</button></form></div></div>}

    {menu&&<div className="focalMobileOverlay"><div className="focalMobilePanel"><div className="focalSearchTop"><strong>{theme.brandName}</strong><button className="focalNavIcon" onClick={()=>setMenu(false)}><X size={17}/></button></div>{tree.map(item=><div key={item.id} className="focalMobileGroup"><Link href={item.url||'#'} onClick={()=>setMenu(false)}>{item.label}</Link>{item.children?.map(c=><Link className="sub" href={c.url||'#'} key={c.id} onClick={()=>setMenu(false)}>{c.label}</Link>)}</div>)}</div></div>}
  </>
}
