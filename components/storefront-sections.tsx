'use client'

import Link from 'next/link'
import {ArrowRight,ChevronRight,Play,Star} from 'lucide-react'

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
    if(u.hostname==='drive.google.com'){
      const id=u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id')
      if(id)return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`
    }
    if(u.hostname.endsWith('dropbox.com')){u.searchParams.set('dl','1');return `/api/image-proxy?url=${encodeURIComponent(u.toString())}`}
    return `/api/image-proxy?url=${encodeURIComponent(value)}`
  }catch{return value}
}

function sectionStyle(theme:AnyMap,s:AnyMap){
  const bg=s.background==='primary'?theme.colors.primary:s.background==='secondary'?theme.colors.secondary:s.background==='dark'?'#181411':s.background==='surface'?theme.colors.surface:s.background==='gradient'?`linear-gradient(135deg,${theme.colors.secondary},${theme.colors.background})`:theme.colors.background
  const light=s.background==='primary'||s.background==='dark'
  return {background:bg,color:light?'#fff':theme.colors.text}
}

function shellClass(s:AnyMap){return `focalSection ${s.animation||''} ${s.fullBleed===false?'contained':''}`}
function price(v:any,currency='USD'){return `${currency} ${(Number(v||0)/100).toFixed(2)}`}

function ProductCard({p,theme}:{p:AnyMap;theme:AnyMap}){
  const image=p.images?.[0]?.url||'/placeholder-product.svg'
  return <Link href={`/product/${p.slug}`} className="focalProductCard">
    <div className="focalProductMedia">
      <img src={img(image)} alt={p.images?.[0]?.alt||p.name}/>
      {p.compareAtPrice&&p.compareAtPrice>p.basePrice?<span className="focalBadge">Sale</span>:p.featured?<span className="focalBadge">Featured</span>:null}
      <div className="focalQuick">Quick view</div>
    </div>
    <div className="focalProductBody">
      <span className="focalEyebrow">{p.vendor||p.category?.name||'Shop'}</span>
      <h3>{p.name}</h3>
      <div className="focalPrice"><strong>{price(p.basePrice,theme.currency||'USD')}</strong>{p.compareAtPrice&&<del>{price(p.compareAtPrice,theme.currency||'USD')}</del>}</div>
    </div>
  </Link>
}

function CollectionCard({c}:{c:AnyMap}){return <Link href={`/collections/${c.slug}`} className="focalCollectionCard"><div className="focalCollectionMedia"><img src={img(c.imageUrl||'/placeholder-product.svg')} alt=""/></div><div className="focalCollectionCopy"><h3>{c.name}</h3><span>Explore <ArrowRight size={14}/></span></div></Link>}

export default function StorefrontSections({theme,sections,products=[],collections=[],product=null,currentCollection=null,preview=false,selectedId,onSelect}:Props){
  const visible=(sections||[]).filter(s=>s&&s.enabled!==false&&s.settings?.enabled!==false&&s.type!=='header'&&s.type!=='footer')
  const click=(id:string,e:React.MouseEvent)=>{if(preview){e.preventDefault();e.stopPropagation();onSelect?.(id)}}
  return <div className="focalStorefront">
    {visible.map(section=>{
      const s=section.settings||{}
      const selected=preview&&selectedId===section.id
      const props={key:section.id,onClick:(e:React.MouseEvent)=>click(section.id,e),className:`${shellClass(s)} ${selected?'isSelected':''}`,style:sectionStyle(theme,s)}

      if(section.type==='announcement')return <section {...props}><div className="focalAnnouncement"><div className="focalContainer focalAnnouncementInner"><span>{s.text||'Free shipping on orders over $50'}</span>{s.link&&<Link href={s.link}>Learn more</Link>}</div></div></section>

      if(section.type==='hero'){
        const desktop=img(s.imageUrl||s.desktopImageUrl||s.mobileImageUrl)
        const mobile=img(s.mobileImageUrl||s.imageUrl||s.desktopImageUrl)
        const overlay=s.overlayStyle==='bottom-gradient'?`linear-gradient(to top,rgba(0,0,0,${Number(s.overlay??.24)}),transparent 72%)`:s.overlayStyle==='none'?'none':`rgba(0,0,0,${Number(s.overlay??.24)})`
        const adapt=s.imageHeightMode!=='fixed'
        return <section {...props}><div className="focalHero" style={{minHeight:adapt?undefined:Number(s.minHeight||640),aspectRatio:adapt&&desktop?'16/7':undefined}}>{desktop&&<><img className="focalHeroImage" src={desktop} alt={s.imageAlt||s.heading||theme.brandName} style={{objectFit:s.imageFit||'cover',objectPosition:`${s.focalX??50}% ${s.focalY??50}%`}}/><div className="focalHeroOverlay" style={{background:overlay}}/></>}<div className={`focalHeroContent ${s.contentBox?'boxed':''} pos-${s.contentPosition||'center-left'}`}><span className="focalPill">{s.eyebrow||'NEW COLLECTION'}</span><h1>{s.heading||'Make your store impossible to ignore.'}</h1><p>{s.text||''}</p><div className="focalButtons"><Link href={s.buttonUrl||'/shop'} className="focalButton primary">{s.buttonLabel||'Shop now'} <ArrowRight size={16}/></Link>{s.secondaryLabel&&<Link href={s.secondaryUrl||'/collections'} className="focalButton secondary">{s.secondaryLabel}</Link>}</div></div></div></section>
      }

      if(section.type==='slideshow'){
        const slides=section.blocks||[]
        const slide=slides[0]?.settings||{}
        return <section {...props}><div className="focalSlideshow"><div className="focalSlide" style={{minHeight:Number(s.minHeight||560)}}>{slide.imageUrl&&<img src={img(slide.imageUrl)} alt={slide.imageAlt||slide.heading||''}/>}<div className="focalSlideShade"/><div className="focalSlideCopy"><span className="focalPill">{slide.eyebrow||'FEATURED'}</span><h2>{slide.heading||s.heading||'Featured'}</h2><p>{slide.text||s.subheading||''}</p>{slide.buttonLabel&&<Link href={slide.buttonUrl||'/shop'} className="focalButton primary">{slide.buttonLabel}</Link>}</div><div className="focalSlideDots">{slides.slice(0,5).map((_:any,i:number)=><span key={i} className={i===0?'active':''}/>)}</div></div></div></section>
      }

      if(section.type==='video')return <section {...props}><div className="focalContainer focalVideo"><div className="focalVideoMedia" style={s.imageUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url(${img(s.imageUrl)})`}:undefined}><span className="focalPlay"><Play size={20}/></span></div><div className="focalVideoCopy"><span className="focalEyebrow">VIDEO</span><h2>{s.heading||'Watch the story'}</h2><p>{s.text||''}</p></div></div></section>

      if(section.type==='image_with_text')return <section {...props}><div className={`focalContainer focalImageText ${s.layout||'image-right'}`}><div className="focalImageTextMedia">{s.imageUrl&&<img src={img(s.imageUrl)} alt={s.imageAlt||''}/>}</div><div className="focalImageTextCopy"><span className="focalEyebrow">{s.eyebrow||'THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p>{s.buttonLabel&&<Link href={s.buttonUrl||'#'} className="focalButton primary">{s.buttonLabel}</Link>}</div></div></section>

      if(['product_grid','product_carousel','featured_product','product_recommendations','main_collection_grid'].includes(section.type)){
        let source=products
        if(section.type==='main_collection_grid'&&currentCollection)source=(currentCollection.products||[]).map((x:any)=>x.product||x)
        if(s.collection)source=source.filter((p:any)=>(p.collections||[]).some((x:any)=>x.collection?.id===s.collection||x.collection?.slug===s.collection||x.collectionId===s.collection))
        const items=source.slice(0,Number(s.limit||8))
        return <section {...props}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{section.type==='product_recommendations'?'RECOMMENDED':'SHOP'}</span><h2>{s.heading||'Featured products'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div>{s.showViewAll!==false&&<Link href="/shop" className="focalTextLink">View all <ChevronRight size={15}/></Link>}</div><div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{items.map((p:any)=><ProductCard p={p} theme={theme} key={p.id}/>)}</div></div></section>
      }

      if(section.type==='collection_grid'||section.type==='collection_carousel'){
        const selectedCollections=s.collectionIds?.length?collections.filter((c:any)=>s.collectionIds.includes(c.id)||s.collectionIds.includes(c.slug)):s.sourceCollection?collections.filter((c:any)=>c.id===s.sourceCollection||c.slug===s.sourceCollection):collections
        return <section {...props}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">COLLECTIONS</span><h2>{s.heading||'Shop by collection'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div><Link href="/collections" className="focalTextLink">All collections <ChevronRight size={15}/></Link></div><div className="focalCollectionGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),5)},minmax(0,1fr))`}}>{selectedCollections.slice(0,Number(s.limit||4)).map((c:any)=><CollectionCard c={c} key={c.id}/>)}</div></div></section>
      }

      if(section.type==='multicolumn')return <section {...props}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">BENEFITS</span><h2>{s.heading||'Why shop with us?'}</h2></div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article key={b.id}><div className="focalColumnIcon">✦</div><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></article>)}</div></div></section>

      if(section.type==='testimonials')return <section {...props}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">REVIEWS</span><h2>{s.heading||'Loved by customers'}</h2></div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),3)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article className="focalQuote" key={b.id}><div className="focalStars">{Array.from({length:5}).map((_,i)=><Star size={14} fill="currentColor" key={i} opacity={i<Number(b.settings?.rating||5)?1:.25}/>)}</div><p>“{b.settings?.quote||''}”</p><strong>{b.settings?.author||''}</strong><span>{b.settings?.role||''}</span></article>)}</div></div></section>

      if(section.type==='logo_list')return <section {...props}><div className="focalContainer"><div className="focalLogoStrip">{(section.blocks||[]).map((b:any)=><div className="focalLogo" key={b.id}>{b.settings?.imageUrl?<img src={img(b.settings.imageUrl)} alt={b.settings?.alt||''}/>:<span>{b.settings?.text||'Brand'}</span>}</div>)}</div></div></section>

      if(section.type==='faq')return <section {...props}><div className="focalContainer focalFaq"><div><span className="focalEyebrow">FAQ</span><h2>{s.heading||'Frequently asked questions'}</h2></div><div className="focalFaqList">{(section.blocks||[]).map((b:any)=><details key={b.id}><summary>{b.settings?.question}<span>+</span></summary><p>{b.settings?.answer}</p></details>)}</div></div></section>

      if(section.type==='rich_text'||section.type==='main_collection_banner')return <section {...props}><div className="focalContainer focalRich"><span className="focalEyebrow">{section.type==='main_collection_banner'?'COLLECTION':s.eyebrow||'ABOUT THE BRAND'}</span><h2>{s.heading||currentCollection?.name||'Tell your story.'}</h2><p>{s.text||s.subheading||currentCollection?.description||''}</p></div></section>

      if(section.type==='newsletter')return <section {...props}><div className="focalContainer"><div className={`focalNewsletter ${s.background||'primary'}`}><div><span className="focalEyebrow">NEWSLETTER</span><h2>{s.heading||'Stay in the loop'}</h2><p>{s.text||''}</p></div><form className="focalNewsletterForm"><input placeholder="Email address"/><button className="focalButton primary" type="button">{s.buttonLabel||'Subscribe'}</button></form></div></div></section>

      if(section.type==='main_product'&&product){
        const gallery=Array.isArray(product.images)?product.images:[]
        return <section {...props}><div className="focalContainer focalProductDetail"><div className="focalProductGallery">{gallery.slice(0,6).map((im:any,i:number)=><img key={im.id||i} src={img(im.url)} alt={im.alt||product.name}/>)}</div><div className="focalProductInfo"><span className="focalEyebrow">{product.vendor||product.category?.name||'PRODUCT'}</span><h1>{product.name}</h1><div className="focalRating">★★★★★ <span>{product.reviews?.length||0} reviews</span></div><p>{product.shortDescription||product.description||''}</p><div className="focalPrice big">{price(product.basePrice,theme.currency||'USD')}{product.compareAtPrice&&<del>{price(product.compareAtPrice,theme.currency||'USD')}</del>}</div><div className="focalPurchaseNote">Sticky Add to cart • Quick buy ready</div><Link href="#" className="focalButton primary wide">Add to cart <ArrowRight size={16}/></Link><div className="focalAccordions"><details open><summary>Description</summary><p>{product.description||product.shortDescription||''}</p></details><details><summary>Shipping & returns</summary><p>Delivery information is shown at checkout.</p></details><details><summary>Product information</summary><p>SKU {product.sku}</p></details></div></div></div></section>
      }
      return null
    })}
  </div>
}
