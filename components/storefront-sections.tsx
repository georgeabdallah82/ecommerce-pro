'use client'

import Link from 'next/link'
import {ArrowRight,ChevronDown,ChevronRight,Heart,Minus,Play,Plus,Search,ShoppingBag,Star,X} from 'lucide-react'
import {useEffect,useMemo,useState} from 'react'
import {useCart} from '@/components/cart-provider'

type AnyMap=Record<string,any>
type Props={
  theme:AnyMap
  sections:AnyMap[]
  products?:AnyMap[]
  collections?:AnyMap[]
  product?:AnyMap|null
  currentCollection?:AnyMap|null
  preview?:boolean
  selectedId?:string
  onSelect?: (id:string)=>void
}

function img(raw:any){
  const value=String(raw||'').trim()
  if(!value)return ''
  if(value.startsWith('/')||value.startsWith('data:')||value.startsWith('blob:'))return value
  try{
    const u=new URL(value)
    if(u.protocol!=='http:'&&u.protocol!=='https:')return value
    if(u.hostname==='drive.google.com'){
      const id=u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id')
      if(id)return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`
    }
    if(u.hostname.endsWith('dropbox.com')){u.searchParams.set('dl','1');return `/api/image-proxy?url=${encodeURIComponent(u.toString())}`}
    return `/api/image-proxy?url=${encodeURIComponent(value)}`
  }catch{return value}
}

function money(v:any,currency='USD'){return `${currency} ${(Number(v||0)/100).toFixed(2)}`}

function sectionStyle(theme:AnyMap,s:AnyMap){
  const bg=s.background==='primary'?theme.colors.primary:s.background==='secondary'?theme.colors.secondary:s.background==='dark'?'#15120f':s.background==='surface'?theme.colors.surface:s.background==='gradient'?`linear-gradient(135deg,${theme.colors.secondary},${theme.colors.background})`:theme.colors.background
  const light=s.background==='primary'||s.background==='dark'
  return {background:bg,color:s.textColor||(light?'#fff':theme.colors.text)}
}

function shellClass(s:AnyMap,type:string){
  const spacing=Math.max(0,Number(s.spacing??(type==='hero'||type==='announcement'?0:72)))
  return `focalSection focalType-${type} ${s.animation||''} ${s.fullBleed===false?'contained':''}`
}

function ProductCard({p,theme,onQuickView,preview,onSelect}:{p:AnyMap;theme:AnyMap;onQuickView:(p:AnyMap)=>void;preview?:boolean;onSelect?:()=>void}){
  const {addItem}=useCart()
  const image=p.images?.[0]?.url||'/placeholder-product.svg'
  const price=Number(p.basePrice||0)
  const compare=Number(p.compareAtPrice||0)
  const quickAdd=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(image),quantity:1})}
  const quickView=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();onQuickView(p)}
  return <Link href={`/product/${p.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="focalProductCard">
    <div className="focalProductMedia">
      <img src={img(image)} alt={p.images?.[0]?.alt||p.name} />
      {compare>price&&<span className="focalBadge">Sale</span>}
      {p.featured&&compare<=price&&<span className="focalBadge">Featured</span>}
      <div className="focalProductActions">
        <button type="button" onClick={quickView} aria-label="Quick view"><Search size={14}/></button>
        <button type="button" onClick={quickAdd} aria-label="Quick add"><ShoppingBag size={14}/></button>
      </div>
    </div>
    <div className="focalProductBody">
      <span className="focalEyebrow">{p.vendor||p.category?.name||'Shop'}</span>
      <h3>{p.name}</h3>
      <div className="focalPrice"><strong>{money(price,theme.currency||'USD')}</strong>{compare>price&&<del>{money(compare,theme.currency||'USD')}</del>}</div>
    </div>
  </Link>
}

function CollectionCard({c,preview,onSelect}:{c:AnyMap;preview?:boolean;onSelect?:()=>void}){
  const click=preview?{onClick:(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();onSelect?.()}}:undefined
  return <Link href={`/collections/${c.slug}`} {...click} className="focalCollectionCard"><div className="focalCollectionMedia"><img src={img(c.imageUrl||'/placeholder-product.svg')} alt=""/></div><div className="focalCollectionCopy"><div><span className="focalEyebrow">COLLECTION</span><h3>{c.name}</h3></div><span>Explore <ArrowRight size={14}/></span></div></Link>
}

function QuickView({product,theme,onClose}:{product:AnyMap;theme:AnyMap;onClose:()=>void}){
  const {addItem}=useCart()
  const [qty,setQty]=useState(1)
  const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null)
  const variant=product.variants?.find((v:any)=>v.id===variantId)
  const value=Number(variant?.price??product.basePrice??0)
  const image=product.images?.[0]?.url||'/placeholder-product.svg'
  return <div className="focalModal" role="dialog" aria-modal="true" onClick={onClose}><div className="focalQuickView" onClick={e=>e.stopPropagation()}><button className="focalQuickClose" onClick={onClose}><X size={18}/></button><div className="focalQuickImage"><img src={img(image)} alt={product.name}/></div><div className="focalQuickInfo"><span className="focalEyebrow">{product.vendor||product.category?.name||'PRODUCT'}</span><h2>{product.name}</h2><div className="focalPrice big">{money(value,theme.currency||'USD')}</div><p>{product.shortDescription||product.description||''}</p>{product.variants?.length>0&&<div className="focalVariantList">{product.variants.map((v:any)=><button key={v.id} className={variantId===v.id?'selected':''} onClick={()=>setVariantId(v.id)}>{v.name}</button>)}</div>}<div className="focalQty"><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={14}/></button><span>{qty}</span><button onClick={()=>setQty(Math.min(99,qty+1))}><Plus size={14}/></button></div><button className="focalButton primary wide" onClick={()=>{addItem({productId:product.id,variantId,name:product.name,sku:variant?.sku||product.sku||product.slug,price:value,image:img(image),quantity:qty});onClose()}}>Add to cart <ShoppingBag size={16}/></button><Link className="focalButton secondary wide" href={`/product/${product.slug}`} onClick={onClose}>View full product</Link></div></div></div>
}

function CollectionToolbar({products,theme,onChange}:{products:AnyMap[];theme:AnyMap;onChange:(next:AnyMap[])=>void}){
  const categories=Array.from(new Set(products.map(p=>p.category?.name).filter(Boolean))) as string[]
  const [q,setQ]=useState('')
  const [cat,setCat]=useState('')
  const [sort,setSort]=useState('featured')
  useEffect(()=>{
    let next=products.filter(p=>!q||String(p.name).toLowerCase().includes(q.toLowerCase())||String(p.vendor||'').toLowerCase().includes(q.toLowerCase()))
    if(cat)next=next.filter(p=>p.category?.name===cat)
    next=[...next].sort((a,b)=>sort==='price-low'?Number(a.basePrice)-Number(b.basePrice):sort==='price-high'?Number(b.basePrice)-Number(a.basePrice):sort==='newest'?new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime():Number(b.featured)-Number(a.featured))
    onChange(next)
  },[q,cat,sort,products,onChange])
  return <div className="focalCollectionToolbar"><div className="focalToolbarSearch"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products"/></div><select value={cat} onChange={e=>setCat(e.target.value)}><option value="">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div>
}

export default function StorefrontSections({theme,sections,products=[],collections=[],product=null,currentCollection=null,preview=false,selectedId,onSelect}:Props){
  const [quickProduct,setQuickProduct]=useState<AnyMap|null>(null)
  const [filteredCollectionProducts,setFilteredCollectionProducts]=useState<AnyMap[]|null>(null)
  const [wishlist,setWishlist]=useState<Record<string,boolean>>({})
  const activeProduct=product||products[0]||null
  const activeCollection=currentCollection||collections[0]||null
  const visible=(sections||[]).filter(s=>s&&s.enabled!==false&&s.settings?.enabled!==false&&s.type!=='header'&&s.type!=='footer')
  useEffect(()=>{
    if(!activeProduct||typeof window==='undefined')return
    try{
      const key='ecom-recent-products-v1';const raw=JSON.parse(localStorage.getItem(key)||'[]');const next=[activeProduct.id,...raw.filter((id:any)=>id!==activeProduct.id)].slice(0,12);localStorage.setItem(key,JSON.stringify(next))
    }catch{}
  },[activeProduct])
  const toggleWish=(id:string)=>setWishlist(w=>({...w,[id]:!w[id]}))
  const click=(id:string,e:React.MouseEvent)=>{if(preview){e.preventDefault();e.stopPropagation();onSelect?.(id)}}
  return <div className="focalStorefront">
    {visible.map(section=>{
      const s=section.settings||{}
      const selected=preview&&selectedId===section.id
      const type=section.type
      const baseProps={key:section.id,onClick:(e:React.MouseEvent)=>click(section.id,e),className:`${shellClass(s,type)} ${selected?'isSelected':''}`,style:{...sectionStyle(theme,s),paddingTop:type==='announcement'||type==='hero'?0:Number(s.spacing??72),paddingBottom:type==='announcement'||type==='hero'?0:Number(s.spacing??72)}}

      if(type==='announcement')return <section {...baseProps} className={`focalSection focalType-announcement announcementSection ${selected?'isSelected':''}`} style={{...sectionStyle(theme,s),padding:0}}><div className="focalAnnouncement"><div className="focalContainer focalAnnouncementInner"><span>{s.text||theme.announcement?.text||'Free shipping on orders over $50'}</span>{s.link&&<Link href={s.link} onClick={preview?e=>e.stopPropagation():undefined}>Learn more</Link>}</div></div></section>

      if(type==='hero'){
        const desktop=img(s.imageUrl||s.desktopImageUrl||s.mobileImageUrl)
        const mobile=img(s.mobileImageUrl||s.imageUrl||s.desktopImageUrl)
        const overlayColor=s.overlayColor||'#000000';const raw=overlayColor.replace('#','');const hex=raw.length===3?raw.split('').map((x:string)=>x+x).join(''):raw;const r=parseInt(hex.slice(0,2),16)||0,g=parseInt(hex.slice(2,4),16)||0,b=parseInt(hex.slice(4,6),16)||0;const op=Math.max(0,Math.min(1,Number(s.overlay??.24)))
        const overlay=s.overlayStyle==='bottom-gradient'?`linear-gradient(to top,rgba(${r},${g},${b},${op}),transparent 72%)`:s.overlayStyle==='full-gradient'?`linear-gradient(135deg,rgba(${r},${g},${b},${op}),rgba(${r},${g},${b},${op*.35}))`:s.overlayStyle==='none'?'none':`rgba(${r},${g},${b},${op})`
        const adapt=s.imageHeightMode!=='fixed'&&s.heightMode!=='fixed'
        const minHeight=Number(s.minHeight||s.customHeight||640)
        return <section {...baseProps} className={`focalSection focalType-hero heroSection ${selected?'isSelected':''}`} style={{...sectionStyle(theme,s),padding:0}}><div className={`focalHero ${s.fullBleed===false?'heroContained':''}`} style={{minHeight:adapt?undefined:minHeight,aspectRatio:adapt&&desktop?'16/7':undefined,borderRadius:Number(s.borderRadius||0)}}>{desktop&&<><picture className="focalHeroMedia"><source media="(max-width:749px)" srcSet={mobile||desktop}/><img className="focalHeroImage" src={desktop} alt={s.imageAlt||s.heading||theme.brandName} style={{objectFit:s.imageFit||'cover',objectPosition:`${s.focalX??50}% ${s.focalY??50}%`}}/></picture><div className="focalHeroOverlay" style={{background:overlay}}/></>} {!desktop&&<div className="focalHeroPlaceholder"/>}<div className={`focalHeroContent ${s.contentBox?'boxed':''} pos-${s.contentPosition||'center-left'}`} style={{textAlign:s.textAlign||'left',maxWidth:Number(s.contentWidth||620)}}><span className="focalPill"><span className="heroDot"/> {s.eyebrow||'NEW COLLECTION'}</span><h1>{s.heading||'Make your store impossible to ignore.'}</h1><p>{s.text||''}</p><div className="focalButtons"><Link href={s.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel||'Shop now'} <ArrowRight size={16}/></Link>{s.secondaryLabel&&<Link href={s.secondaryUrl||'/collections'} className="focalButton secondary" onClick={preview?e=>e.stopPropagation():undefined}>{s.secondaryLabel}</Link>}</div></div></div></section>
      }

      if(type==='slideshow'){
        const slides=section.blocks||[];const slide=slides[0]?.settings||{}
        return <section {...baseProps}><div className="focalSlideshow"><div className="focalSlide" style={{minHeight:Number(s.minHeight||560)}}>{slide.imageUrl&&<img src={img(slide.imageUrl)} alt={slide.imageAlt||slide.heading||''}/>}<div className="focalSlideShade"/><div className="focalSlideCopy"><span className="focalPill">{slide.eyebrow||'FEATURED'}</span><h2>{slide.heading||s.heading||'Featured'}</h2><p>{slide.text||s.subheading||''}</p>{slide.buttonLabel&&<Link href={slide.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?e=>e.stopPropagation():undefined}>{slide.buttonLabel}</Link>}</div><div className="focalSlideDots">{slides.slice(0,6).map((_:any,i:number)=><span key={i} className={i===0?'active':''}/>)}</div></div></div></section>
      }

      if(type==='video')return <section {...baseProps}><div className="focalContainer focalVideo"><div className="focalVideoMedia" style={s.imageUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url(${img(s.imageUrl)})`}:undefined}><span className="focalPlay"><Play size={20}/></span></div><div className="focalVideoCopy"><span className="focalEyebrow">VIDEO</span><h2>{s.heading||'Watch the story'}</h2><p>{s.text||''}</p></div></div></section>

      if(type==='image_with_text')return <section {...baseProps}><div className={`focalContainer focalImageText ${s.layout||'image-right'}`}><div className="focalImageTextMedia">{s.imageUrl&&<img src={img(s.imageUrl)} alt={s.imageAlt||''}/>}</div><div className="focalImageTextCopy"><span className="focalEyebrow">{s.eyebrow||'THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p>{s.buttonLabel&&<Link className="focalButton primary" href={s.buttonUrl||'#'} onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel}</Link>}</div></div></section>

      if(['product_grid','product_carousel','featured_product','product_recommendations'].includes(type)){
        let source=s.collection?products.filter((p:any)=>(p.collections||[]).some((x:any)=>x.collection?.id===s.collection||x.collection?.slug===s.collection||x.collectionId===s.collection)):products
        const items=source.slice(0,Number(s.limit||8))
        return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{type==='product_recommendations'?'RECOMMENDED':'SHOP / CURATED'}</span><h2>{s.heading||'Featured products'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div>{s.showViewAll!==false&&<Link href="/shop" className="focalTextLink">View all <ChevronRight size={15}/></Link>}</div><div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{items.map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>
      }

      if(type==='collection_grid'||type==='collection_carousel'){
        const selectedCollections=s.collectionIds?.length?collections.filter((c:any)=>s.collectionIds.includes(c.id)||s.collectionIds.includes(c.slug)):s.sourceCollection?collections.filter((c:any)=>c.id===s.sourceCollection||c.slug===s.sourceCollection):collections
        return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">COLLECTIONS</span><h2>{s.heading||'Shop by collection'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div><Link href="/collections" className="focalTextLink">All collections <ChevronRight size={15}/></Link></div><div className="focalCollectionGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),5)},minmax(0,1fr))`}}>{selectedCollections.slice(0,Number(s.limit||4)).map((c:any)=><CollectionCard c={c} key={c.id} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>
      }

      if(type==='main_collection_banner'){
        const c=activeCollection
        return <section {...baseProps}><div className="focalContainer focalCollectionHero"><div className="focalCollectionHeroCopy"><span className="focalEyebrow">COLLECTION</span><h2>{s.heading||c?.name||'Collection'}</h2><p>{s.text||s.subheading||c?.description||''}</p></div>{(s.imageUrl||c?.imageUrl)&&<div className="focalCollectionHeroImage"><img src={img(s.imageUrl||c?.imageUrl)} alt={c?.name||''}/></div>}</div></section>
      }

      if(type==='main_collection_grid'){
        const c=activeCollection
        let source=c?.products?.map((x:any)=>x.product||x)||products
        const visibleProducts=filteredCollectionProducts||source
        const shown=visibleProducts.slice(0,Number(s.limit||24))
        return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{c?.name||'COLLECTION'}</span><h2>{s.heading||'Products'}</h2></div><span className="focalResultCount">{visibleProducts.length} products</span></div>{s.showFilters!==false&&<CollectionToolbar products={source} theme={theme} onChange={setFilteredCollectionProducts}/>}<div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{shown.map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>
      }

      if(type==='multicolumn')return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">BENEFITS</span><h2>{s.heading||'Why shop with us?'}</h2></div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article key={b.id}><div className="focalColumnIcon">✦</div><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></article>)}</div></div></section>

      if(type==='promo_grid')return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">FEATURED</span><h2>{s.heading||'Shop the edit'}</h2></div></div><div className="focalPromoGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><Link key={b.id} href={b.settings?.url||'#'} className="focalPromoCard" onClick={preview?e=>e.stopPropagation():undefined}><div className="focalPromoMedia" style={b.settings?.imageUrl?{backgroundImage:`url(${img(b.settings.imageUrl)})`}:undefined}><span>Explore <ArrowRight size={14}/></span></div><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></Link>)}</div></div></section>

      if(type==='testimonials')return <section {...baseProps}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">REVIEWS</span><h2>{s.heading||'Loved by customers'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),3)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article className="focalQuote" key={b.id}><div className="focalStars">{Array.from({length:5}).map((_,i)=><Star size={14} fill="currentColor" key={i} opacity={i<Number(b.settings?.rating||5)?1:.22}/>)}</div><p>“{b.settings?.quote||''}”</p><strong>{b.settings?.author||''}</strong><span>{b.settings?.role||''}</span></article>)}</div></div></section>

      if(type==='logo_list')return <section {...baseProps}><div className="focalContainer"><div className="focalLogoStrip">{(section.blocks||[]).map((b:any)=><div className="focalLogo" key={b.id}>{b.settings?.imageUrl?<img src={img(b.settings.imageUrl)} alt={b.settings?.alt||''}/>:<span>{b.settings?.text||'Brand'}</span>}</div>)}</div></div></section>

      if(type==='faq')return <section {...baseProps}><div className="focalContainer focalFaq"><div><span className="focalEyebrow">FAQ</span><h2>{s.heading||'Frequently asked questions'}</h2></div><div className="focalFaqList">{(section.blocks||[]).map((b:any)=><details key={b.id}><summary>{b.settings?.question}<ChevronDown size={16}/></summary><p>{b.settings?.answer}</p></details>)}</div></div></section>

      if(type==='rich_text')return <section {...baseProps}><div className="focalContainer focalRich"><span className="focalEyebrow">{s.eyebrow||'ABOUT THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p></div></section>

      if(type==='newsletter')return <section {...baseProps}><div className="focalContainer"><div className={`focalNewsletter ${s.background||'primary'}`}><div><span className="focalEyebrow">NEWSLETTER</span><h2>{s.heading||'Stay in the loop'}</h2><p>{s.text||''}</p></div><form className="focalNewsletterForm" onSubmit={e=>e.preventDefault()}><input type="email" placeholder="Email address"/><button className="focalButton primary" type="submit">{s.buttonLabel||'Subscribe'}</button></form></div></div></section>

      if(type==='main_product'){
        const p=activeProduct
        if(!p)return null
        const gallery=Array.isArray(p.images)&&p.images.length?p.images:[{url:'/placeholder-product.svg',alt:p.name}]
        const variants=Array.isArray(p.variants)?p.variants:[]
        const [selectedVariantId,setSelectedVariantId]=useState<string|null>(variants[0]?.id||null)
        const [qty,setQty]=useState(1)
        const {addItem}=useCart()
        const selectedVariant=variants.find((v:any)=>v.id===selectedVariantId)
        const currentPrice=Number(selectedVariant?.price??p.basePrice??0)
        const add=()=>addItem({productId:p.id,variantId:selectedVariant?.id||null,name:p.name,sku:selectedVariant?.sku||p.sku||p.slug,price:currentPrice,image:img(gallery[0]?.url),quantity:qty})
        return <section {...baseProps}><div className="focalContainer focalProductDetail"><div className="focalProductGallery">{gallery.slice(0,8).map((im:any,i:number)=><img key={im.id||i} src={img(im.url)} alt={im.alt||p.name}/>)}</div><div className="focalProductInfo"><span className="focalEyebrow">{p.vendor||p.category?.name||'PRODUCT'}</span><h1>{p.name}</h1><div className="focalRating">★★★★★ <span>{p.reviews?.length||0} reviews</span></div><div className="focalPrice big">{money(currentPrice,theme.currency||'USD')}{p.compareAtPrice&&<del>{money(p.compareAtPrice,theme.currency||'USD')}</del>}</div><p>{p.shortDescription||p.description||''}</p>{variants.length>0&&<div className="focalProductOptions"><div className="focalOptionLabel">Options</div><div className="focalVariantList">{variants.map((v:any)=><button key={v.id} className={selectedVariantId===v.id?'selected':''} onClick={()=>setSelectedVariantId(v.id)}>{v.name}</button>)}</div></div>}<div className="focalStock"><span className="focalStockDot"/> In stock • Fast delivery</div><div className="focalPurchaseRow"><div className="focalQty"><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={14}/></button><span>{qty}</span><button onClick={()=>setQty(Math.min(99,qty+1))}><Plus size={14}/></button></div><button className="focalButton primary wide" onClick={add}>Add to cart <ShoppingBag size={16}/></button><button className="focalWishlist" aria-label="Wishlist" onClick={()=>toggleWish(p.id)}><Heart size={18} fill={wishlist[p.id]?'currentColor':'none'}/></button></div><div className="focalTrustGrid"><span>✓ Secure checkout</span><span>✓ Easy returns</span><span>✓ Fast delivery</span></div><div className="focalAccordions"><details open><summary>Description<ChevronDown size={16}/></summary><p>{p.description||p.shortDescription||''}</p></details><details><summary>Shipping & returns<ChevronDown size={16}/></summary><p>{s.shippingText||'Delivery information is shown at checkout. Returns are handled according to your store policy.'}</p></details><details><summary>Product information<ChevronDown size={16}/></summary><p>SKU {selectedVariant?.sku||p.sku||'—'}</p></details></div></div></div></section>
      }

      return null
    })}
    {quickProduct&&<QuickView product={quickProduct} theme={theme} onClose={()=>setQuickProduct(null)}/>} 
  </div>
}
