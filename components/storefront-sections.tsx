'use client'

import Link from 'next/link'
import {ArrowRight,Award,Check,ChevronDown,ChevronRight,Heart,Headphones,Lock,Minus,Play,Plus,RotateCcw,Search,ShieldCheck,ShoppingBag,Star,Truck,X} from 'lucide-react'
import {useContext,useEffect,useMemo,useState} from 'react'
import {useCart} from '@/components/cart-provider'
import NewsletterForm from '@/components/newsletter-form'
import {StorefrontPreviewContext} from '@/components/preview-context'
import {useWishlist} from '@/components/use-wishlist'
import { FreeDeliveryBadge, ShippingNote, merchantShippingText } from '@/components/shipping-note'
import { BundlesSection, CategorySpotlight, HeroSlider, OfferBanners, ProductRail, ProductTabs, RecentlyViewed, ShopByPrice } from '@/components/market-sections'

const TRUST_ICONS:Record<string,typeof ShieldCheck>={truck:Truck,shield:ShieldCheck,return:RotateCcw,lock:Lock,support:Headphones,award:Award}

type AnyMap=Record<string,any>
// Small label above a section heading. Editable in the theme studio; an empty value hides it,
// an unset one keeps the original wording so existing stores look unchanged.
const eyebrowOf=(s:AnyMap,fallback:string)=>typeof s.eyebrow==='string'?s.eyebrow:fallback
type Props={theme:AnyMap;sections:AnyMap[];products?:AnyMap[];collections?:AnyMap[];product?:AnyMap|null;currentCollection?:AnyMap|null;preview?:boolean;selectedId?:string;onSelect?:(id:string)=>void}
function img(raw:any){const value=String(raw||'').trim();if(!value)return '';if(value.startsWith('/')||value.startsWith('data:')||value.startsWith('blob:'))return value;try{const u=new URL(value);if(u.protocol!=='http:'&&u.protocol!=='https:')return value;if(u.hostname==='drive.google.com'){const id=u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id');if(id)return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`}if(u.hostname.endsWith('dropbox.com')){u.searchParams.set('dl','1');return `/api/image-proxy?url=${encodeURIComponent(u.toString())}`}return `/api/image-proxy?url=${encodeURIComponent(value)}`}catch{return value}}
export function money(v:any,currency='USD'){return `${currency} ${(Number(v||0)/100).toFixed(2)}`}
export {img}
export function StoreImage({src,alt,className,eager=false,width,height}:{src:any;alt:string;className?:string;eager?:boolean;width?:number;height?:number}){const [failed,setFailed]=useState(false);const fallback='/placeholder-product.svg';const source=failed?fallback:(img(src)||fallback);return <img className={className} src={source} alt={alt} width={width} height={height} loading={eager?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>}
// On mobile, a merchant who never uploaded a dedicated mobile crop gets the
// desktop banner reused verbatim -- but the mobile hero box is a different
// (narrower, often taller) shape than a wide desktop banner, so `cover`
// would slice off most of the image's width to fill it. Rather than crop,
// that fallback case shows the full image via `object-fit:contain` with a
// blurred, darkened duplicate of the same image filling the box behind it
// (the common "letterbox" treatment), so nothing is ever cut off and there's
// no dead flat-color space either. A dedicated mobile image is assumed to
// already be cropped on purpose, so it keeps the merchant's normal fit/focal
// settings instead.
function HeroMedia({desktop,mobile,alt,fit,focalX,focalY,hasMobileImage}:{desktop:string;mobile:string;alt:string;fit:string;focalX:number;focalY:number;hasMobileImage:boolean}){
  const [failed,setFailed]=useState(false)
  if(failed)return <div className="focalHeroPlaceholder"/>
  const objectPosition=`${focalX}% ${focalY}%`
  // object-fit:contain never crops, so on its own it can leave the section's
  // plain background peeking through as dead space above/below (or beside)
  // the image. Whenever "contain" is the chosen fit, pair it with a blurred,
  // darkened duplicate of the same image as a full-bleed backdrop -- the
  // same "no dead space" treatment already used below for the mobile
  // fallback when no distinct mobile image is uploaded, just applied
  // consistently at every viewport instead of only that one case.
  const contain=fit==='contain'
  // Only needed when neither of those two already-safe cases applies: a
  // distinct mobile image means each viewport gets its own correctly-fit
  // image anyway, and "contain" already avoids cropping on its own.
  const desktopOnly=!hasMobileImage&&!contain
  const picClass=desktopOnly?'focalHeroPic focalHeroDesktopOnly':'focalHeroPic'
  return <div className="focalHeroMedia">
    {contain&&<picture className={picClass}>
      <source media="(max-width:749px)" srcSet={mobile||desktop}/>
      <img className="focalHeroBackdrop" src={desktop} alt="" aria-hidden="true" loading="eager"/>
    </picture>}
    <picture className={picClass}>
      <source media="(max-width:749px)" srcSet={mobile||desktop}/>
      <img className={contain?'focalHeroImage focalHeroContain':'focalHeroImage'} style={contain?{objectPosition}:{objectFit:fit as any,objectPosition}} src={desktop} alt={alt} loading="eager" decoding="async" onError={()=>setFailed(true)}/>
    </picture>
    {desktopOnly&&<div className="focalHeroMobileFallback">
      <img className="focalHeroBackdrop" src={desktop} alt="" aria-hidden="true" loading="eager"/>
      <img className="focalHeroImage focalHeroContain" src={desktop} alt={alt} loading="eager" decoding="async" onError={()=>setFailed(true)}/>
    </div>}
  </div>
}
function sectionStyle(theme:AnyMap,s:AnyMap){const bg=s.background==='primary'?theme.colors.primary:s.background==='secondary'?theme.colors.secondary:s.background==='dark'?'#15120f':s.background==='surface'?theme.colors.surface:s.background==='gradient'?`linear-gradient(135deg,${theme.colors.secondary},${theme.colors.background})`:theme.colors.background;const light=s.background==='primary'||s.background==='dark';return {background:bg,color:s.textColor||(light?'#fff':theme.colors.text),...boxStyle(s)}}

// Renders the admin-configurable "hero" section (theme editor: Home page > Hero) --
// shared by the theme editor's live preview (StorefrontSections below) and the
// fixed AliExpress-style homepage, so a merchant's hero heading/image/buttons show
// up on the real storefront instead of only in the editor.
export function HeroSection({theme,section,preview=false,selected=false,onSelect}:{theme:AnyMap;section:AnyMap;preview?:boolean;selected?:boolean;onSelect?:(id:string)=>void}){
  const s=section.settings||{}
  const desktop=img(s.imageUrl||s.desktopImageUrl||s.mobileImageUrl)
  const mobile=img(s.mobileImageUrl||s.imageUrl||s.desktopImageUrl)
  const hasMobileImage=Boolean(String(s.mobileImageUrl||'').trim())
  const fit=['cover','contain','fill'].includes(s.imageFit)?s.imageFit:'cover'
  const focalX=Math.max(0,Math.min(100,Number(s.focalX??50)))
  const focalY=Math.max(0,Math.min(100,Number(s.focalY??50)))
  const overlayColor=s.overlayColor||'#000000'
  const raw=overlayColor.replace('#','')
  const hex=raw.length===3?raw.split('').map((x:string)=>x+x).join(''):raw
  const r=parseInt(hex.slice(0,2),16)||0,g=parseInt(hex.slice(2,4),16)||0,b=parseInt(hex.slice(4,6),16)||0
  const op=Math.max(0,Math.min(1,Number(s.overlay??.24)))
  const overlay=s.overlayStyle==='bottom-gradient'?`linear-gradient(to top,rgba(${r},${g},${b},${op}),transparent 72%)`:s.overlayStyle==='full-gradient'?`linear-gradient(135deg,rgba(${r},${g},${b},${op}),rgba(${r},${g},${b},${op*.35}))`:s.overlayStyle==='none'?'none':`rgba(${r},${g},${b},${op})`
  const adapt=s.imageHeightMode!=='fixed'&&s.heightMode!=='fixed'
  const showContent=s.showContent!==false
  const click=(e:React.MouseEvent)=>{if(preview){e.preventDefault();e.stopPropagation();onSelect?.(section.id)}}
  return <section className={`focalSection focalType-hero heroSection ${selected?'isSelected':''}`} style={{...sectionStyle(theme,s),padding:0}} onClick={click}>
    <div className={`focalHero ${s.fullBleed===false?'heroContained':''}`} style={{minHeight:adapt?undefined:Number(s.minHeight||s.customHeight||640),aspectRatio:adapt&&desktop?'16/7':undefined,borderRadius:Number(s.borderRadius||0)}}>
      {desktop&&<><HeroMedia desktop={desktop} mobile={mobile} alt={s.imageAlt||s.heading||theme.brandName} fit={fit} focalX={focalX} focalY={focalY} hasMobileImage={hasMobileImage}/>{showContent&&<div className="focalHeroOverlay" style={{background:overlay}}/>}</>}
      {!desktop&&<div className="focalHeroPlaceholder"/>}
      {showContent&&<div className={`focalHeroContent ${s.contentBox?'boxed':''} pos-${s.contentPosition||'center-left'}`} style={{textAlign:s.textAlign||'left',maxWidth:Number(s.contentWidth||620)}}>
        <span className="focalPill"><span className="heroDot"/> {s.eyebrow||'NEW COLLECTION'}</span>
        <h1>{s.heading||'Make your store impossible to ignore.'}</h1>
        <p>{s.text||''}</p>
        <div className="focalButtons">
          <Link href={s.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel||'Shop now'} <ArrowRight size={16}/></Link>
          {s.secondaryLabel&&<Link href={s.secondaryUrl||'/collections'} className="focalButton secondary" onClick={preview?e=>e.stopPropagation():undefined}>{s.secondaryLabel}</Link>}
        </div>
      </div>}
    </div>
  </section>
}
// Left is the default and adds no class; center/right restyle the section head and rows (see storefront-legacy.css).
// Section width (a narrower content box) and where that box and the cards sit; see storefront-legacy.css.
function boxWidth(s:AnyMap){const w=Number(s.sectionWidth);return w>0?w:0}
function boxClass(s:AnyMap){return `${s.blockAlign==='center'?' block-center':s.blockAlign==='right'?' block-right':''}${boxWidth(s)?` has-sec-w sec-${s.sectionPosition==='left'?'left':s.sectionPosition==='right'?'right':'center'}`:''}`}
function boxStyle(s:AnyMap):React.CSSProperties{return boxWidth(s)?({'--sec-w':`${boxWidth(s)}px`} as any):{}}
function alignClass(s:AnyMap){return `${s.textAlign==='center'?' align-center':s.textAlign==='right'?' align-right':''}${boxClass(s)}`}
function shellClass(s:AnyMap,type:string){return `focalSection focalType-${type} ${s.animation||''} ${s.fullBleed===false?'contained':''}${alignClass(s)}`}
// Used to always show slides[0] and nothing else -- the dots existed but never
// switched slides and nothing ever rotated, so the editor's "Autoplay" toggle and
// any slide added after the first were both invisible to customers regardless of
// settings. Now actually cycles (respecting Autoplay) and the dots are clickable.
function SlideshowSection({section,commonClass,commonStyle,preview,click}:{section:AnyMap;commonClass:string;commonStyle:any;preview?:boolean;click:(id:string,e:React.MouseEvent)=>void}){
  const s=section.settings||{}
  const slides=section.blocks||[]
  const [index,setIndex]=useState(0)
  useEffect(()=>{if(index>=slides.length)setIndex(0)},[slides.length,index])
  useEffect(()=>{
    if(s.autoplay===false||slides.length<2)return
    const id=setInterval(()=>setIndex(i=>(i+1)%slides.length),5000)
    return ()=>clearInterval(id)
  },[s.autoplay,slides.length])
  const slide=slides[index]?.settings||{}
  return <section className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}>
    <div className="focalSlideshow">
      <div className="focalSlide" style={{minHeight:Number(s.minHeight||560)}}>
        {slide.imageUrl&&<StoreImage src={slide.imageUrl} alt={slide.imageAlt||slide.heading||''} eager/>}
        <div className="focalSlideShade"/>
        <div className="focalSlideCopy">
          <span className="focalPill">{slide.eyebrow||'FEATURED'}</span>
          <h2>{slide.heading||s.heading||'Featured'}</h2>
          <p>{slide.text||s.subheading||''}</p>
          {slide.buttonLabel&&<Link href={slide.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?(e:React.MouseEvent)=>e.stopPropagation():undefined}>{slide.buttonLabel}</Link>}
        </div>
        {slides.length>1&&<div className="focalSlideDots">{slides.slice(0,6).map((_:any,i:number)=><button key={i} type="button" className={i===index?'active':''} onClick={e=>{e.stopPropagation();setIndex(i)}} aria-label={`Go to slide ${i+1}`}/>)}</div>}
      </div>
    </div>
  </section>
}
export function StarRow({rating,size=13}:{rating:number;size?:number}){
  const full=Math.round(rating);
  return <span className="focalStars">{Array.from({length:5}).map((_,i)=><Star size={size} fill="currentColor" key={i} opacity={i<full?1:.22}/>)}</span>;
}
export function formatSold(n:number){
  if(!n||n<=0)return '';
  if(n>=1000)return `${(n/1000).toFixed(n%1000===0?0:1)}k+ sold`;
  return `${n}+ sold`;
}
export function ProductCard({p,theme,onQuickView,preview,onSelect,wishlist,toggleWish}:{p:AnyMap;theme:AnyMap;onQuickView:(p:AnyMap)=>void;preview?:boolean;onSelect?:()=>void;wishlist?:Record<string,boolean>;toggleWish?:(id:string)=>void}){
  const {addItem}=useCart();
  const [added,setAdded]=useState(false);
  const primaryImage=p.images?.[0]?.url||'/placeholder-product.svg';
  const secondaryImage=p.images?.[1]?.url||null;
  const price=Number(p.basePrice||0);
  const compare=Number(p.compareAtPrice||0);
  const discountPct=compare>price?Math.round((1-price/compare)*100):0;
  const reviewCount=Number(p.reviewCount||0);
  const soldLabel=formatSold(Number(p.soldCount||0));
  const quickAdd=(e:React.MouseEvent)=>{
    e.preventDefault();
    e.stopPropagation();
    if(p.soldOut)return;
    if(Array.isArray(p.variants)&&p.variants.length){onQuickView(p);return}
    setAdded(true);
    addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(primaryImage),quantity:1});
    setTimeout(()=>setAdded(false),1400);
  };
  const quickView=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();onQuickView(p)};
  const wished=Boolean(wishlist?.[p.id]);
  const wish=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();toggleWish?.(p.id)};
  if(theme.design==='market'){
    const card=theme.productCardMarket||{};
    const hasOptions=Array.isArray(p.variants)&&p.variants.length>0;
    return (
      <Link href={`/product/${p.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="mkCard">
        <div className="mkCardMedia">
          <StoreImage src={primaryImage} alt={p.images?.[0]?.alt||p.name}/>
          {discountPct>0&&<span className="mkCardBadge">-{discountPct}%</span>}
          {toggleWish&&<button type="button" className={`mkCardWish ${wished?'active':''}`} onClick={wish} aria-label={wished?'Remove from wishlist':'Add to wishlist'}><Heart size={15} fill={wished?'currentColor':'none'}/></button>}
        </div>
        <div className="mkCardBody">
          <h3>{p.name}</h3>
          {reviewCount>0&&<div className="mkCardRating"><StarRow rating={Number(p.rating||0)} size={12}/><span>({reviewCount})</span></div>}
          <div className="mkCardPrice"><strong>{money(price,theme.currency||'USD')}</strong>{compare>price&&<del>{money(compare,theme.currency||'USD')}</del>}</div>
          {card.deliveryText!==''&&<span className="mkCardNote"><Truck size={13}/> {card.deliveryText||'Cash on delivery'}</span>}
          {card.showAddToCart!==false&&(p.soldOut
            ?<button type="button" className="mkCardAdd soldOut" disabled>Sold out</button>
            :<button type="button" className={`mkCardAdd ${added?'done':''}`} onClick={quickAdd}>{added?<><Check size={15}/> Added</>:hasOptions?'Choose options':'Add to cart'}</button>)}
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/product/${p.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="focalProductCard">
      <div className={`focalProductMedia ${secondaryImage?'hasHoverImage':''}`}>
        <StoreImage className="focalProductImagePrimary" src={primaryImage} alt={p.images?.[0]?.alt||p.name}/>
        {secondaryImage&&<StoreImage className="focalProductImageSecondary" src={secondaryImage} alt={p.images?.[1]?.alt||p.name}/>}
        {discountPct>0?<span className="focalBadge">-{discountPct}%</span>:p.featured&&<span className="focalBadge">Featured</span>}
        {toggleWish&&<button type="button" className={`focalWishlist cardWishlist ${wished?'active':''}`} onClick={wish} aria-label={wished?'Remove from wishlist':'Add to wishlist'}><Heart size={15} fill={wished?'currentColor':'none'}/></button>}
        <div className="focalProductActions">
          <button type="button" onClick={quickView} aria-label="Quick view"><Search size={14}/></button>
          <button type="button" onClick={quickAdd} aria-label={added?'Added to cart':'Quick add'} className={added?'focalQuickAddDone':''}>
            {added ? <Check size={14}/> : <ShoppingBag size={14}/>}
          </button>
        </div>
      </div>
      <div className="focalProductBody">
        <span className="focalEyebrow">{p.vendor||'Shop'}</span>
        <h3>{p.name}</h3>
        {reviewCount>0&&<div className="focalCardRating"><StarRow rating={Number(p.rating||0)}/><span>({reviewCount})</span></div>}
        <div className="focalPrice">
          <strong>{money(price,theme.currency||'USD')}</strong>
          {compare>price&&<del>{money(compare,theme.currency||'USD')}</del>}
        </div>
        {soldLabel&&<span className="focalSoldCount">{soldLabel}</span>}
      </div>
    </Link>
  );
}
export function CollectionCard({c,preview,onSelect}:{c:AnyMap;preview?:boolean;onSelect?:()=>void}){return <Link href={`/collections/${c.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="focalCollectionCard"><div className="focalCollectionMedia"><StoreImage src={c.imageUrl||'/placeholder-product.svg'} alt={c.name||'Collection'}/></div><div className="focalCollectionCopy"><span className="focalCollectionName">{c.name}</span></div></Link>}
export function QuickView({product,theme,onClose}:{product:AnyMap;theme:AnyMap;onClose:()=>void}){
  const {addItem}=useCart();
  const [qty,setQty]=useState(1);
  const [added,setAdded]=useState(false);
  // Options that are sold out can't be picked; the first one still for sale is preselected.
  const firstOpen=(product.variants||[]).find((v:any)=>v.available!==0)?.id||product.variants?.[0]?.id||null;
  const [variantId,setVariantId]=useState<string|null>(firstOpen);
  useEffect(()=>{setVariantId(firstOpen);setQty(1)},[product?.id]);
  const variant=product.variants?.find((v:any)=>v.id===variantId);
  const value=Number(variant?.price??product.basePrice??0);
  const image=product.images?.[0]?.url||'/placeholder-product.svg';
  const soldOut=Boolean(product.soldOut)||variant?.available===0;
  const maxQty=typeof variant?.available==='number'?Math.max(1,variant.available):99;
  const handleAdd=()=>{
    if(soldOut)return;
    setAdded(true);
    if(soldOut)return;
    addItem({productId:product.id,variantId,name:variant?.name?`${product.name} — ${variant.name}`:product.name,sku:variant?.sku||product.sku||product.slug,price:value,image:img(image),quantity:Math.min(qty,maxQty)});
    setTimeout(()=>{setAdded(false);onClose()},600);
  };
  return (
    <div className="focalModal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="focalQuickView" onClick={e=>e.stopPropagation()}>
        <button className="focalQuickClose" onClick={onClose} aria-label="Close quick view"><X size={18}/></button>
        <div className="focalQuickImage"><StoreImage src={image} alt={product.name} eager/></div>
        <div className="focalQuickInfo">
          <span className="focalEyebrow">{product.vendor||'PRODUCT'}</span>
          <h2>{product.name}</h2>
          <div className="focalPrice big">{money(value,theme.currency||'USD')}</div>
          <p>{product.shortDescription||product.description||''}</p>
          {product.variants?.length>0&&<div className="focalVariantList">{product.variants.map((v:any)=><button key={v.id} className={variantId===v.id?'selected':''} disabled={v.available===0} aria-label={v.available===0?`${v.name} (sold out)`:undefined} onClick={()=>setVariantId(v.id)}>{v.name}{v.available===0?' · Sold out':''}</button>)}</div>}
          <div className="focalQty">
            <button onClick={()=>setQty(Math.max(1,qty-1))} aria-label="Decrease quantity"><Minus size={14}/></button>
            <span>{qty}</span>
            <button onClick={()=>setQty(Math.min(maxQty,qty+1))} aria-label="Increase quantity"><Plus size={14}/></button>
          </div>
          <button className={`focalButton primary wide ${added?'addedSuccess':''}`} onClick={handleAdd} disabled={soldOut}>
            {soldOut ? 'Sold out' : added ? <>Added to cart <Check size={16}/></> : <>Add to cart <ShoppingBag size={16}/></>}
          </button>
          <Link className="focalButton secondary wide" href={`/product/${product.slug}`} onClick={onClose}>View full product</Link>
        </div>
      </div>
    </div>
  );
}
function CollectionToolbar({products,onChange}:{products:AnyMap[];onChange:(next:AnyMap[])=>void}){const vendors=Array.from(new Set(products.map(p=>p.vendor).filter(Boolean))) as string[];const [q,setQ]=useState('');const [vendor,setVendor]=useState('');const [sort,setSort]=useState('featured');useEffect(()=>{let next=products.filter(p=>!q||String(p.name).toLowerCase().includes(q.toLowerCase())||String(p.vendor||'').toLowerCase().includes(q.toLowerCase()));if(vendor)next=next.filter(p=>p.vendor===vendor);next=[...next].sort((a,b)=>sort==='price-low'?Number(a.basePrice)-Number(b.basePrice):sort==='price-high'?Number(b.basePrice)-Number(a.basePrice):sort==='newest'?new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime():Number(b.featured)-Number(a.featured));onChange(next)},[q,vendor,sort,products,onChange]);return <div className="focalCollectionToolbar"><div className="focalToolbarSearch"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products" aria-label="Search products"/></div><select value={vendor} onChange={e=>setVendor(e.target.value)} aria-label="Filter by brand"><option value="">All brands</option>{vendors.map(v=><option key={v} value={v}>{v}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div>}
function MainProductSection({section,theme,product,preview,selected,onSelect,wishlist,toggleWish}:{section:AnyMap;theme:AnyMap;product:AnyMap|null;preview?:boolean;selected?:boolean;onSelect?:(id:string)=>void;wishlist:Record<string,boolean>;toggleWish:(id:string)=>void}){
  const {addItem}=useCart();
  const [selectedVariantId,setSelectedVariantId]=useState<string|null>(product?.variants?.[0]?.id||null);
  const [qty,setQty]=useState(1);
  const [activeImgIndex,setActiveImgIndex]=useState(0);
  const [added,setAdded]=useState(false);
  const [stickyVisible,setStickyVisible]=useState(false);

  useEffect(()=>{setSelectedVariantId(product?.variants?.[0]?.id||null);setQty(1);setActiveImgIndex(0)},[product?.id]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const handleScroll=()=>{
      setStickyVisible(window.scrollY>280);
    };
    window.addEventListener('scroll',handleScroll,{passive:true});
    return ()=>window.removeEventListener('scroll',handleScroll);
  },[]);

  if(!product)return null;
  const s=section.settings||{};
  const gallery=Array.isArray(product.images)&&product.images.length?product.images:[{url:'/placeholder-product.svg',alt:product.name}];
  const variants=Array.isArray(product.variants)?product.variants:[];
  const selectedVariant=variants.find((v:any)=>v.id===selectedVariantId);
  const currentPrice=Number(selectedVariant?.price??product.basePrice??0);
  const activeImage=gallery[activeImgIndex]?.url||gallery[0]?.url||'/placeholder-product.svg';

  const add=()=>{
    setAdded(true);
    addItem({
      productId:product.id,
      variantId:selectedVariant?.id||null,
      name:product.name,
      sku:selectedVariant?.sku||product.sku||product.slug,
      price:currentPrice,
      image:img(activeImage),
      quantity:qty
    });
    setTimeout(()=>setAdded(false),1500);
  };

  return (
    <section className={`focalSection focalType-main_product ${selected?'isSelected':''}`} style={{paddingTop:Number(s.spacing??72),paddingBottom:Number(s.spacing??72),...sectionStyle(theme,s)}} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.(section.id)}:undefined}>
      <div className="focalContainer focalProductDetail">
        <div className="focalProductGalleryWrapper">
          <div className="focalProductMainImage">
            <StoreImage src={activeImage} alt={gallery[activeImgIndex]?.alt||product.name} eager/>
          </div>
          {gallery.length>1&&(
            <div className="focalProductThumbStrip" role="tablist" aria-label="Product image thumbnails">
              {gallery.slice(0,8).map((im:any,i:number)=>(
                <button
                  key={im.id||i}
                  type="button"
                  role="tab"
                  aria-selected={activeImgIndex===i}
                  className={`focalProductThumbBtn ${activeImgIndex===i?'active':''}`}
                  onClick={()=>setActiveImgIndex(i)}
                  aria-label={`View image ${i+1}`}
                >
                  <StoreImage src={im.url} alt={im.alt||product.name}/>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="focalProductInfo">
          <span className="focalEyebrow">{product.vendor||'PRODUCT'}</span>
          <h1>{product.name}</h1>
          <div className="focalRating"><StarRow rating={Number(product.rating||0)} size={15}/> <span>{product.reviewCount||product.reviews?.length||0} reviews</span></div>
          {Number(product.soldCount||0)>0&&<div className="focalSoldCount standalone">{formatSold(Number(product.soldCount))}</div>}
          <div className="focalPrice big">
            {money(currentPrice,theme.currency||'USD')}
            {product.compareAtPrice&&<del>{money(product.compareAtPrice,theme.currency||'USD')}</del>}
          </div>
          <p>{product.shortDescription||product.description||''}</p>
          {variants.length>0&&(
            <div className="focalProductOptions">
              <div className="focalOptionLabel">Variants & Options</div>
              <div className="focalVariantList">
                {variants.map((v:any)=>(
                  <button key={v.id} className={selectedVariantId===v.id?'selected':''} onClick={()=>setSelectedVariantId(v.id)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="focalStock">
            <span className="focalStockDot"/> In stock
          </div>
          <div className="focalPurchaseRow">
            <div className="focalQty">
              <button onClick={()=>setQty(Math.max(1,qty-1))} aria-label="Decrease quantity"><Minus size={14}/></button>
              <span>{qty}</span>
              <button onClick={()=>setQty(Math.min(99,qty+1))} aria-label="Increase quantity"><Plus size={14}/></button>
            </div>
            <button className={`focalButton primary wide ${added?'addedSuccess':''}`} onClick={add}>
              {added ? (
                <>Added to Cart <Check size={16}/></>
              ) : (
                <>Add to cart <ShoppingBag size={16}/></>
              )}
            </button>
            <button className="focalWishlist" aria-label="Wishlist" onClick={()=>toggleWish(product.id)}>
              <Heart size={18} fill={wishlist[product.id]?'currentColor':'none'}/>
            </button>
          </div>
          <div className="focalTrustGrid">
            <span>✓ Secure checkout</span>
            <span>✓ Easy returns</span>
            <FreeDeliveryBadge />
          </div>
          <div className="focalAccordions">
            <details open><summary>Description<ChevronDown size={16}/></summary><p>{product.description||product.shortDescription||''}</p></details>
            <details><summary>Shipping & returns<ChevronDown size={16}/></summary><p>{merchantShippingText(s.shippingText) || <ShippingNote />}</p></details>
            <details><summary>Product information<ChevronDown size={16}/></summary><p>SKU {selectedVariant?.sku||product.sku||'—'}</p></details>
          </div>
        </div>
      </div>

      {/* STICKY MOBILE BUY BAR */}
      {stickyVisible && !preview && (
        <div className="focalStickyBuyBar" role="region" aria-label="Quick purchase">
          <div className="focalStickyBuyBar-info">
            <img className="focalStickyBuyBar-thumb" src={img(activeImage)} alt="" />
            <div className="focalStickyBuyBar-meta">
              <span className="focalStickyBuyBar-title">{product.name}</span>
              <span className="focalStickyBuyBar-price">{money(currentPrice,theme.currency||'USD')}</span>
            </div>
          </div>
          <button className={`focalButton primary focalStickyBuyBar-btn ${added?'addedSuccess':''}`} onClick={add}>
            {added ? <>Added ✓</> : <>Add to Cart</>}
          </button>
        </div>
      )}
    </section>
  );
}
function CountdownSection({section,theme,preview,click,products,onQuickView,onSelect,wishlist,toggleWish}:{section:AnyMap;theme:AnyMap;preview?:boolean;click:(id:string,e:React.MouseEvent)=>void;products:AnyMap[];onQuickView:(p:AnyMap)=>void;onSelect?:()=>void;wishlist:Record<string,boolean>;toggleWish:(id:string)=>void}){
  const s=section.settings||{}
  const commonStyle={...sectionStyle(theme,s),paddingTop:Number(s.spacing??72),paddingBottom:Number(s.spacing??72)}
  const commonClass=`${shellClass(s,'countdown')} ${s.background==='primary'||s.background==='dark'?'onDark':''}`
  const target=Date.parse(s.endDate||'')||0
  const [remaining,setRemaining]=useState(()=>Math.max(0,target-Date.now()))
  useEffect(()=>{
    if(!target)return
    setRemaining(Math.max(0,target-Date.now()))
    const id=setInterval(()=>setRemaining(Math.max(0,target-Date.now())),1000)
    return ()=>clearInterval(id)
  },[target])
  const totalSec=Math.floor(remaining/1000)
  const days=Math.floor(totalSec/86400)
  const hours=Math.floor((totalSec%86400)/3600)
  const mins=Math.floor((totalSec%3600)/60)
  const secs=totalSec%60
  const ended=target>0&&remaining<=0
  const source=s.collection?products.filter((p:any)=>(p.collections||[]).some((x:any)=>x.collection?.id===s.collection||x.collection?.slug===s.collection||x.collectionId===s.collection)):products
  const deals=Number(s.limit||0)>0?source.slice(0,Number(s.limit||6)):[]
  return (
    <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}>
      <div className="focalContainer focalCountdown">
        <div className="focalCountdownCopy">
          <span className="focalEyebrow">{s.eyebrow||'LIMITED TIME'}</span>
          <h2>{s.heading||'Sale ends soon'}</h2>
          {s.text&&<p>{s.text}</p>}
          {s.buttonLabel&&<Link href={s.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?(e:React.MouseEvent)=>e.stopPropagation():undefined}>{s.buttonLabel}</Link>}
        </div>
        {target>0&&!ended&&(
          <div className="focalCountdownTimer">
            {[['Days',days],['Hrs',hours],['Min',mins],['Sec',secs]].map(([label,value])=>(
              <div className="focalCountdownUnit" key={label as string}><strong>{String(value).padStart(2,'0')}</strong><span>{label}</span></div>
            ))}
          </div>
        )}
      </div>
      {deals.length>0&&<div className="focalContainer focalDealStrip">{deals.map((p:any)=><div className="focalDealCard" key={p.id}><ProductCard p={p} theme={theme} onQuickView={onQuickView} preview={preview} onSelect={onSelect} wishlist={wishlist} toggleWish={toggleWish}/></div>)}</div>}
    </section>
  )
}
// The countdown here always targets "midnight tonight" (unlike CountdownSection
// above, which targets an admin-set date) -- that's what components/aliexpress-home.tsx
// has always done for this section, and this renderer exists specifically so a
// flash_deals section looks and behaves identically whether it's reached via the
// real homepage or (once wired up) this shared, addable-anywhere section system.
// Editor only: a section that has nothing to show renders nothing on the store, which made it
// look like it had vanished. In the editor preview it says why and how to fill it instead.
function EmptySectionNotice({id,name,reason,fix,selected,click}:{id:string;name:string;reason:string;fix:string;selected?:boolean;click:(id:string,e:React.MouseEvent)=>void}){return <section className={`themeEmptyNotice ${selected?'isSelected':''}`} onClick={e=>click(id,e)}><div className="focalContainer"><strong>{name} is hidden on your store</strong><span>{reason}</span><em>{fix}</em></div></section>}

function FlashDealsSection({section,theme,discounted:autoDiscounted,products=[],preview,click,onQuickView,onSelect,wishlist,toggleWish}:{section:AnyMap;theme:AnyMap;discounted:AnyMap[];products?:AnyMap[];preview?:boolean;click:(id:string,e:React.MouseEvent)=>void;onQuickView:(p:AnyMap)=>void;onSelect?:()=>void;wishlist:Record<string,boolean>;toggleWish:(id:string)=>void}){
  const s=section.settings||{}
  // Hand-picked products (in the merchant's order) replace the automatic "everything on sale" list.
  const picked=Array.isArray(s.productIds)&&s.productIds.length?s.productIds.map((id:any)=>products.find((p:any)=>p.id===id)).filter(Boolean):[]
  const discounted=picked.length?picked:autoDiscounted
  // Editable from the theme studio: show/hide, "daily" (resets at midnight, the
  // default, so existing stores look unchanged) or a fixed end date & time.
  const showTimer=s.showCountdown!==false
  const fixedEnd=s.countdownMode==='date'?Date.parse(s.endDate||'')||0:0
  const [remaining,setRemaining]=useState<number|null>(null)
  useEffect(()=>{
    if(!showTimer)return
    const compute=()=>{
      if(s.countdownMode==='date')return fixedEnd?Math.max(0,fixedEnd-Date.now()):0
      const next=new Date();next.setHours(24,0,0,0);return Math.max(0,next.getTime()-Date.now())
    }
    setRemaining(compute())
    const id=setInterval(()=>setRemaining(compute()),1000)
    return ()=>clearInterval(id)
  },[showTimer,s.countdownMode,fixedEnd])
  if(!discounted.length)return preview?<EmptySectionNotice id={section.id} name="Flash deals" reason="No product is on sale right now." fix="Give a product a compare-at price higher than its price and it appears here." click={click}/>:null
  const totalSec=Math.floor((remaining||0)/1000)
  const dd=Math.floor(totalSec/86400)
  const hh=Math.floor((totalSec%86400)/3600)
  const mm=Math.floor((totalSec%3600)/60)
  const ss=totalSec%60
  const two=(n:number)=>String(n).padStart(2,'0')
  // A fixed-date deal that has already ended shows no timer rather than 00:00:00.
  const timerVisible=showTimer&&remaining!==null&&!(s.countdownMode==='date'&&(!fixedEnd||remaining<=0))
  return (
    <section key={section.id} className={`aliFlash${alignClass(s)}`} style={boxStyle(s)} onClick={e=>click(section.id,e)}>
      <div className="aliContainer aliFlashHead">
        <div className="aliFlashTitle"><span className="aliFlashBolt">⚡</span><h2>{s.heading||'Flash Deals'}</h2></div>
        {timerVisible&&<div className="aliFlashTimer">
          <span>{s.countdownLabel||'Ends in'}</span>
          {dd>0&&<><strong>{dd}d</strong>:</>}
          <strong>{two(hh)}</strong>:
          <strong>{two(mm)}</strong>:
          <strong>{two(ss)}</strong>
        </div>}
        {s.showViewAll!==false&&<Link href="/shop" className="aliViewAll" onClick={preview?(e:React.MouseEvent)=>e.stopPropagation():undefined}>View all <ChevronRight size={15}/></Link>}
      </div>
      <div className="aliContainer aliFlashGrid">
        {(picked.length?picked:discounted.slice(0,Number(s.limit)||12)).map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={onQuickView} preview={preview} onSelect={onSelect} wishlist={wishlist} toggleWish={toggleWish}/>)}
      </div>
    </section>
  )
}
export {StorefrontPreviewContext}

export default function StorefrontSections({theme,sections,products=[],collections=[],product=null,currentCollection=null,preview:previewProp=false,selectedId:selectedIdProp,onSelect:onSelectProp}:Props){const previewCtx=useContext(StorefrontPreviewContext);const preview=previewProp||!!previewCtx;const selectedId=selectedIdProp??previewCtx?.selectedId;const onSelect=onSelectProp??previewCtx?.onSelect;const [quickProduct,setQuickProduct]=useState<AnyMap|null>(null);const [filteredCollectionProducts,setFilteredCollectionProducts]=useState<AnyMap[]|null>(null);const {wishlist,toggleWish}=useWishlist();const activeProduct=product||products[0]||null;const activeCollection=currentCollection||collections[0]||null;const discounted=useMemo(()=>products.filter((p:any)=>Number(p.compareAtPrice||0)>Number(p.basePrice||0)).sort((a:any,b:any)=>(Number(b.compareAtPrice)-Number(b.basePrice))/Number(b.compareAtPrice)-(Number(a.compareAtPrice)-Number(a.basePrice))/Number(a.compareAtPrice)),[products]);const newArrivals=useMemo(()=>[...products].sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[products]);const bestSellers=useMemo(()=>[...products].sort((a:any,b:any)=>Number(b.soldCount||0)-Number(a.soldCount||0)),[products]);const visible=(sections||[]).filter((s:any)=>s&&s.enabled!==false&&s.settings?.enabled!==false&&s.type!=='header'&&s.type!=='announcement');useEffect(()=>{if(!product||preview||typeof window==='undefined')return;try{const key='ecom-recent-products-v1';const raw=JSON.parse(localStorage.getItem(key)||'[]');const next=[product.id,...raw.filter((id:any)=>id!==product.id)].slice(0,12);localStorage.setItem(key,JSON.stringify(next))}catch{}},[product,preview]);const collectionThumb=(c:AnyMap)=>{const ids=new Set((c.products||[]).map((x:AnyMap)=>x.productId));return products.find((p:AnyMap)=>ids.has(p.id)&&p.images?.[0]?.url)?.images?.[0]?.url};const click=(id:string,e:React.MouseEvent)=>{if(preview){e.preventDefault();e.stopPropagation();onSelect?.(id)}};return <div className={preview?'focalStorefront themeEditorPreview':'focalStorefront'}>{visible.map((section:any)=>{const s=section.settings||{};const selected=preview&&selectedId===section.id;const type=section.type;const commonStyle={...sectionStyle(theme,s),paddingTop:type==='hero'?0:Number(s.spacing??72),paddingBottom:type==='hero'?0:Number(s.spacing??72),...(s.textAlign?{textAlign:s.textAlign}:{})};const commonClass=`${shellClass(s,type)} ${selected?'isSelected':''}`
const market={section,theme,products,collections,preview,selected,click,onQuickView:setQuickProduct,onSelect:()=>onSelect?.(section.id),wishlist,toggleWish}
if(type==='hero_slider')return <HeroSlider key={section.id} {...market}/>
if(type==='offer_banners')return <OfferBanners key={section.id} {...market}/>
if(type==='product_tabs')return <ProductTabs key={section.id} {...market}/>
if(type==='product_rail')return <ProductRail key={section.id} {...market}/>
if(type==='category_spotlight')return <CategorySpotlight key={section.id} {...market}/>
if(type==='shop_by_price')return <ShopByPrice key={section.id} {...market}/>
if(type==='recently_viewed')return <RecentlyViewed key={section.id} {...market}/>
if(type==='bundles')return <BundlesSection key={section.id} {...market}/>
if(type==='hero'){return <HeroSection key={section.id} theme={theme} section={section} preview={preview} selected={selected} onSelect={onSelect}/>}
if(type==='category_strip'){if(!collections.length)return preview?<EmptySectionNotice key={section.id} id={section.id} name="Category strip" reason="There are no active collections." fix="Create a collection (or switch one on) in Collections." selected={selected} click={click}/>:null;return <section key={section.id} className={`aliCategoryStrip${boxClass(s)} ${selected?'isSelected':''}`} style={boxStyle(s)} onClick={e=>click(section.id,e)}>{theme.design==='market'&&s.heading&&<div className="mkWrap mkHead mkStripHead"><h2>{s.heading}</h2></div>}<div className="aliContainer aliCategoryRow">{((Array.isArray(s.collectionIds)&&s.collectionIds.length?s.collectionIds.map((id:any)=>collections.find((c:any)=>c.id===id||c.slug===id)).filter(Boolean):collections.slice(0,Number(s.limit)||12)) as any[]).map((c:any)=><Link key={c.id} href={`/shop?collection=${c.slug}`} className="aliCategoryItem" onClick={preview?(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation()}:undefined}><span className="aliCategoryIcon"><StoreImage src={c.imageUrl||collectionThumb(c)||'/placeholder-product.svg'} alt={c.name}/></span><span>{c.name}</span></Link>)}</div></section>}
if(type==='flash_deals'){return <FlashDealsSection key={section.id} section={section} theme={theme} discounted={discounted} products={products} preview={preview} click={click} onQuickView={setQuickProduct} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>}
if(type==='new_arrivals'){if(!newArrivals.length)return preview?<EmptySectionNotice key={section.id} id={section.id} name="New arrivals" reason="There are no active products yet." fix="Add a product (status Active) and it appears here." selected={selected} click={click}/>:null;return <section key={section.id} className={`aliSection${alignClass(s)} ${selected?'isSelected':''}`} style={boxStyle(s)} onClick={e=>click(section.id,e)}><div className="aliContainer aliSectionHead"><h2>{s.heading||'New Arrivals'}</h2>{s.showViewAll!==false&&<Link href="/shop?sort=newest" className="aliViewAll" onClick={preview?(e:React.MouseEvent)=>e.stopPropagation():undefined}>View all <ChevronRight size={15}/></Link>}</div><div className="aliContainer aliDenseGrid">{newArrivals.slice(0,Number(s.limit)||12).map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>)}</div></section>}
if(type==='best_sellers'){const soldOnly=bestSellers.filter((p:any)=>Number(p.soldCount||0)>0);const sold=soldOnly.length||s.whenEmpty==='hide'?soldOnly:newArrivals;if(!sold.length)return preview?<EmptySectionNotice key={section.id} id={section.id} name="Best sellers" reason={newArrivals.length?'No product has sold yet.':'There are no active products yet.'} fix={newArrivals.length?'Set \u201cIf nothing has sold yet\u201d to \u201cShow newest products\u201d, or wait for the first sale.':'Add a product (status Active).'} selected={selected} click={click}/>:null;return <section key={section.id} className={`aliSection${alignClass(s)} ${selected?'isSelected':''}`} style={boxStyle(s)} onClick={e=>click(section.id,e)}><div className="aliContainer aliSectionHead"><h2>{s.heading||'Best Sellers'}</h2>{s.showViewAll!==false&&<Link href="/shop" className="aliViewAll" onClick={preview?(e:React.MouseEvent)=>e.stopPropagation():undefined}>View all <ChevronRight size={15}/></Link>}</div><div className="aliContainer aliDenseGrid">{sold.slice(0,Number(s.limit)||12).map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>)}</div></section>}
if(type==='announcement_strip'){const bars=(section.blocks||[]).filter((b:any)=>b.settings?.text);if(!bars.length)return preview?<EmptySectionNotice key={section.id} id={section.id} name="Announcement strip" reason="It has no messages." fix="Add a message in this section's settings." selected={selected} click={click}/>:null;return <div key={section.id} className={selected?'isSelected':''} onClick={e=>click(section.id,e)}>{bars.map((b:any)=>{const style={background:s.backgroundColor||undefined,color:s.textColor||undefined,textAlign:(s.textAlign as any)||undefined};return b.settings.link&&!preview?<Link key={b.id} href={b.settings.link} className="aliAnnouncementBar" style={{...style,display:'block'}}>{b.settings.text}</Link>:<div key={b.id} className="aliAnnouncementBar" style={style}>{b.settings.text}</div>})}</div>}
if(type==='trust_strip'){const items=section.blocks||[];if(!items.length)return preview?<EmptySectionNotice key={section.id} id={section.id} name="Trust strip" reason="It has no items." fix="Add an item in this section's settings." selected={selected} click={click}/>:null;return <section key={section.id} className={`aliTrustStrip${boxClass(s)} ${selected?'isSelected':''}`} style={boxStyle(s)} onClick={e=>click(section.id,e)}><div className="aliContainer aliTrustRow">{items.map((b:any)=><div className="aliTrustItem" key={b.id} style={{textAlign:(s.textAlign as any)||undefined}}><strong>{b.settings?.heading||'Why shop with us'}</strong>{b.settings?.text&&<span>{b.settings.text}</span>}</div>)}</div></section>}
if(type==='slideshow'){return <SlideshowSection key={section.id} section={section} commonClass={commonClass} commonStyle={commonStyle} preview={preview} click={click}/>}
if(type==='video')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalVideo"><div className="focalVideoMedia" style={s.imageUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url(${img(s.imageUrl)})`}:undefined}><span className="focalPlay"><Play size={20}/></span></div><div className="focalVideoCopy">{eyebrowOf(s,'VIDEO')&&<span className="focalEyebrow">{eyebrowOf(s,'VIDEO')}</span>}<h2>{s.heading||'Watch the story'}</h2><p>{s.text||''}</p></div></div></section>
if(type==='image_with_text')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className={`focalContainer focalImageText ${s.layout||'image-right'}`}><div className="focalImageTextMedia">{s.imageUrl&&<StoreImage src={s.imageUrl} alt={s.imageAlt||''}/>}</div><div className="focalImageTextCopy"><span className="focalEyebrow">{s.eyebrow||'THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p>{s.buttonLabel&&<Link className="focalButton primary" href={s.buttonUrl||'#'} onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel}</Link>}</div></div></section>
if(['product_grid','product_carousel','featured_product','product_recommendations'].includes(type)){const source=s.collection?products.filter((p:any)=>(p.collections||[]).some((x:any)=>x.collection?.id===s.collection||x.collection?.slug===s.collection||x.collectionId===s.collection)):products;const handPicked=Array.isArray(s.productIds)&&s.productIds.length?s.productIds.map((id:any)=>products.find((p:any)=>p.id===id)).filter(Boolean):null;const items=handPicked||source.slice(0,Number(s.limit||8));return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,type==='product_recommendations'?'RECOMMENDED':'SHOP / CURATED')&&<span className="focalEyebrow">{eyebrowOf(s,type==='product_recommendations'?'RECOMMENDED':'SHOP / CURATED')}</span>}<h2>{s.heading||'Featured products'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div>{s.showViewAll!==false&&<Link href="/shop" className="focalTextLink">View all <ChevronRight size={15}/></Link>}</div><div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`,['--cols' as any]:Math.min(Number(s.columns||4),6)}}>{items.map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>)}</div></div></section>}
if(type==='collection_grid'||type==='collection_carousel'){const pickedCollections=Array.isArray(s.collectionIds)&&s.collectionIds.length?s.collectionIds.map((id:any)=>collections.find((c:any)=>c.id===id||c.slug===id)).filter(Boolean):null;const selectedCollections=pickedCollections||(s.sourceCollection?collections.filter((c:any)=>c.id===s.sourceCollection||c.slug===s.sourceCollection):collections);return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,'COLLECTIONS')&&<span className="focalEyebrow">{eyebrowOf(s,'COLLECTIONS')}</span>}<h2>{s.heading||'Shop by collection'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div><Link href="/collections" className="focalTextLink">All collections <ChevronRight size={15}/></Link></div><div className="focalCollectionGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),5)},minmax(0,1fr))`}}>{(pickedCollections||selectedCollections.slice(0,Number(s.limit||4))).map((c:any)=><CollectionCard c={c} key={c.id} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>}
if(type==='main_collection_banner'){const c=activeCollection;return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalCollectionHero"><div className="focalCollectionHeroCopy"><span className="focalEyebrow">{s.eyebrow||'COLLECTION'}</span><h2>{s.heading||c?.name||'Collection'}</h2><p>{s.text||s.subheading||c?.description||''}</p></div>{(s.imageUrl||c?.imageUrl)&&<div className="focalCollectionHeroImage"><StoreImage src={s.imageUrl||c?.imageUrl} alt={c?.name||''}/></div>}</div></section>}
if(type==='main_collection_grid'){const c=activeCollection;const source=c?.products?.map((x:any)=>x.product||x)||products;const visibleProducts=filteredCollectionProducts||source;return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{c?.name||'COLLECTION'}</span><h2>{s.heading||'Products'}</h2></div><span className="focalResultCount">{visibleProducts.length} products</span></div>{s.showFilters!==false&&<CollectionToolbar products={source} onChange={setFilteredCollectionProducts}/>}<div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`,['--cols' as any]:Math.min(Number(s.columns||4),6)}}>{visibleProducts.slice(0,Number(s.limit||24)).map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>)}</div></div></section>}
if(type==='multicolumn')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,'BENEFITS')&&<span className="focalEyebrow">{eyebrowOf(s,'BENEFITS')}</span>}<h2>{s.heading||'Why shop with us?'}</h2></div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article key={b.id}>{b.settings?.imageUrl?<StoreImage src={b.settings.imageUrl} alt={b.settings?.heading||''} className="focalColumnImage"/>:<div className="focalColumnIcon">✦</div>}<h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></article>)}</div></div></section>
if(type==='promo_grid')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,'FEATURED')&&<span className="focalEyebrow">{eyebrowOf(s,'FEATURED')}</span>}<h2>{s.heading||'Shop the edit'}</h2></div></div><div className="focalPromoGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`,['--cols' as any]:Math.min(Number(s.columns||3),4)}}>{(section.blocks||[]).map((b:any)=><Link key={b.id} href={b.settings?.url||'#'} className="focalPromoCard" onClick={preview?e=>e.stopPropagation():undefined}><div className="focalPromoMedia" style={b.settings?.imageUrl?{backgroundImage:`url(${img(b.settings.imageUrl)})`}:undefined}><div className="focalPromoOverlay"><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p><span>Explore <ArrowRight size={14}/></span></div></div></Link>)}</div></div></section>
if(type==='testimonials')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,'REVIEWS')&&<span className="focalEyebrow">{eyebrowOf(s,'REVIEWS')}</span>}<h2>{s.heading||'Loved by customers'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),3)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article className="focalQuote" key={b.id}><div className="focalStars">{Array.from({length:5}).map((_,i)=><Star size={14} fill="currentColor" key={i} opacity={i<Number(b.settings?.rating||5)?1:.22}/>)}</div><p>“{b.settings?.quote||''}”</p><strong>{b.settings?.author||''}</strong><span>{b.settings?.role||''}</span></article>)}</div></div></section>
if(type==='logo_list')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalLogoStrip">{(section.blocks||[]).map((b:any)=><div className="focalLogo" key={b.id}>{b.settings?.imageUrl?<StoreImage src={b.settings.imageUrl} alt={b.settings?.alt||b.settings?.text||'Brand'}/>:<span>{b.settings?.text||'Brand'}</span>}</div>)}</div></div></section>
if(type==='faq')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalFaq"><div>{eyebrowOf(s,'FAQ')&&<span className="focalEyebrow">{eyebrowOf(s,'FAQ')}</span>}<h2>{s.heading||'Frequently asked questions'}</h2></div><div className="focalFaqList">{(section.blocks||[]).map((b:any)=><details key={b.id}><summary>{b.settings?.question}<ChevronDown size={16}/></summary><p>{b.settings?.answer}</p></details>)}</div></div></section>
if(type==='rich_text')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalRich"><span className="focalEyebrow">{s.eyebrow||'ABOUT THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p>{s.buttonLabel&&<Link className="focalButton primary" href={s.buttonUrl||'#'} onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel}</Link>}</div></section>
if(type==='newsletter')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className={`focalNewsletter ${s.background||'primary'}`}><div>{eyebrowOf(s,'NEWSLETTER')&&<span className="focalEyebrow">{eyebrowOf(s,'NEWSLETTER')}</span>}<h2>{s.heading||'Stay in the loop'}</h2><p>{s.text||''}</p></div><NewsletterForm className="focalNewsletterForm" buttonClassName="focalButton primary" buttonLabel={s.buttonLabel||'Subscribe'} placeholder={s.placeholder||'Email address'} successMessage={s.successMessage||'Thanks for subscribing!'} source="homepage" preview={preview}/></div></div></section>
if(type==='trust_badges')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalTrustBadges">{(section.blocks||[]).map((b:any)=>{const Icon=TRUST_ICONS[b.settings?.icon]||ShieldCheck;return <div className="focalTrustBadge" key={b.id}><Icon size={22}/><strong>{b.settings?.heading}</strong>{b.settings?.text&&<span>{b.settings.text}</span>}</div>})}</div></div></section>
if(type==='stats')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div>{eyebrowOf(s,'BY THE NUMBERS')&&<span className="focalEyebrow">{eyebrowOf(s,'BY THE NUMBERS')}</span>}<h2>{s.heading||'Trusted by thousands'}</h2></div></div><div className="focalStatsGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{(section.blocks||[]).map((b:any)=><div className="focalStat" key={b.id}><strong>{b.settings?.value}</strong><span>{b.settings?.label}</span></div>)}</div></div></section>
if(type==='social_grid')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{s.handle||'FOLLOW US'}</span><h2>{s.heading||'Shop the feed'}</h2></div></div><div className="focalSocialGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||5),6)},minmax(0,1fr))`}}>{(section.blocks||[]).map((b:any)=><Link key={b.id} href={b.settings?.url||'#'} className="focalSocialItem" onClick={preview?(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation()}:undefined}>{b.settings?.imageUrl&&<StoreImage src={b.settings.imageUrl} alt=""/>}</Link>)}</div></div></section>
if(type==='countdown')return <CountdownSection key={section.id} section={section} theme={theme} preview={preview} click={click} products={products} onQuickView={setQuickProduct} onSelect={()=>onSelect?.(section.id)} wishlist={wishlist} toggleWish={toggleWish}/>
if(type==='main_product')return <MainProductSection key={section.id} section={section} theme={theme} product={activeProduct} preview={preview} selected={selected} onSelect={onSelect} wishlist={wishlist} toggleWish={toggleWish}/>
return null})}{quickProduct&&<QuickView product={quickProduct} theme={theme} onClose={()=>setQuickProduct(null)}/>}</div>}
