'use client'

import Link from 'next/link'
import {ArrowRight,Award,Check,ChevronDown,ChevronRight,Heart,Headphones,Lock,Minus,Play,Plus,RotateCcw,Search,ShieldCheck,ShoppingBag,Star,Truck,X} from 'lucide-react'
import {useEffect,useState} from 'react'
import {useCart} from '@/components/cart-provider'
import {Footer} from '@/components/footer'

const TRUST_ICONS:Record<string,typeof ShieldCheck>={truck:Truck,shield:ShieldCheck,return:RotateCcw,lock:Lock,support:Headphones,award:Award}

type AnyMap=Record<string,any>
type Props={theme:AnyMap;sections:AnyMap[];products?:AnyMap[];collections?:AnyMap[];product?:AnyMap|null;currentCollection?:AnyMap|null;preview?:boolean;selectedId?:string;onSelect?:(id:string)=>void}
function img(raw:any){const value=String(raw||'').trim();if(!value)return '';if(value.startsWith('/')||value.startsWith('data:')||value.startsWith('blob:'))return value;try{const u=new URL(value);if(u.protocol!=='http:'&&u.protocol!=='https:')return value;if(u.hostname==='drive.google.com'){const id=u.pathname.match(/^\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id');if(id)return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`}if(u.hostname.endsWith('dropbox.com')){u.searchParams.set('dl','1');return `/api/image-proxy?url=${encodeURIComponent(u.toString())}`}return `/api/image-proxy?url=${encodeURIComponent(value)}`}catch{return value}}
function money(v:any,currency='USD'){return `${currency} ${(Number(v||0)/100).toFixed(2)}`}
function StoreImage({src,alt,className,eager=false,width,height}:{src:any;alt:string;className?:string;eager?:boolean;width?:number;height?:number}){const [failed,setFailed]=useState(false);const fallback='/placeholder-product.svg';const source=failed?fallback:(img(src)||fallback);return <img className={className} src={source} alt={alt} width={width} height={height} loading={eager?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>}
function sectionStyle(theme:AnyMap,s:AnyMap){const bg=s.background==='primary'?theme.colors.primary:s.background==='secondary'?theme.colors.secondary:s.background==='dark'?'#15120f':s.background==='surface'?theme.colors.surface:s.background==='gradient'?`linear-gradient(135deg,${theme.colors.secondary},${theme.colors.background})`:theme.colors.background;const light=s.background==='primary'||s.background==='dark';return {background:bg,color:s.textColor||(light?'#fff':theme.colors.text)}}
function shellClass(s:AnyMap,type:string){return `focalSection focalType-${type} ${s.animation||''} ${s.fullBleed===false?'contained':''}`}
function ProductCard({p,theme,onQuickView,preview,onSelect}:{p:AnyMap;theme:AnyMap;onQuickView:(p:AnyMap)=>void;preview?:boolean;onSelect?:()=>void}){
  const {addItem}=useCart();
  const [added,setAdded]=useState(false);
  const primaryImage=p.images?.[0]?.url||'/placeholder-product.svg';
  const secondaryImage=p.images?.[1]?.url||null;
  const price=Number(p.basePrice||0);
  const compare=Number(p.compareAtPrice||0);
  const quickAdd=(e:React.MouseEvent)=>{
    e.preventDefault();
    e.stopPropagation();
    if(Array.isArray(p.variants)&&p.variants.length){onQuickView(p);return}
    setAdded(true);
    addItem({productId:p.id,variantId:null,name:p.name,sku:p.sku||p.slug,price,image:img(primaryImage),quantity:1});
    setTimeout(()=>setAdded(false),1400);
  };
  const quickView=(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();onQuickView(p)};
  return (
    <Link href={`/product/${p.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="focalProductCard">
      <div className={`focalProductMedia ${secondaryImage?'hasHoverImage':''}`}>
        <StoreImage className="focalProductImagePrimary" src={primaryImage} alt={p.images?.[0]?.alt||p.name}/>
        {secondaryImage&&<StoreImage className="focalProductImageSecondary" src={secondaryImage} alt={p.images?.[1]?.alt||p.name}/>}
        {compare>price&&<span className="focalBadge">Sale</span>}
        {p.featured&&compare<=price&&<span className="focalBadge">Featured</span>}
        <div className="focalProductActions">
          <button type="button" onClick={quickView} aria-label="Quick view"><Search size={14}/></button>
          <button type="button" onClick={quickAdd} aria-label={added?'Added to cart':'Quick add'} className={added?'focalQuickAddDone':''}>
            {added ? <Check size={14}/> : <ShoppingBag size={14}/>}
          </button>
        </div>
      </div>
      <div className="focalProductBody">
        <span className="focalEyebrow">{p.vendor||p.category?.name||'Shop'}</span>
        <h3>{p.name}</h3>
        <div className="focalPrice">
          <strong>{money(price,theme.currency||'USD')}</strong>
          {compare>price&&<del>{money(compare,theme.currency||'USD')}</del>}
        </div>
      </div>
    </Link>
  );
}
function CollectionCard({c,preview,onSelect}:{c:AnyMap;preview?:boolean;onSelect?:()=>void}){return <Link href={`/collections/${c.slug}`} onClick={preview?e=>{e.preventDefault();e.stopPropagation();onSelect?.()}:undefined} className="focalCollectionCard"><div className="focalCollectionMedia"><StoreImage src={c.imageUrl||'/placeholder-product.svg'} alt={c.name||'Collection'}/></div><div className="focalCollectionCopy"><div><span className="focalEyebrow">COLLECTION</span><h3>{c.name}</h3></div><span>Explore <ArrowRight size={14}/></span></div></Link>}
function QuickView({product,theme,onClose}:{product:AnyMap;theme:AnyMap;onClose:()=>void}){
  const {addItem}=useCart();
  const [qty,setQty]=useState(1);
  const [added,setAdded]=useState(false);
  const [variantId,setVariantId]=useState<string|null>(product.variants?.[0]?.id||null);
  useEffect(()=>{setVariantId(product.variants?.[0]?.id||null);setQty(1)},[product?.id]);
  const variant=product.variants?.find((v:any)=>v.id===variantId);
  const value=Number(variant?.price??product.basePrice??0);
  const image=product.images?.[0]?.url||'/placeholder-product.svg';
  const handleAdd=()=>{
    setAdded(true);
    addItem({productId:product.id,variantId,name:product.name,sku:variant?.sku||product.sku||product.slug,price:value,image:img(image),quantity:qty});
    setTimeout(()=>{setAdded(false);onClose()},600);
  };
  return (
    <div className="focalModal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="focalQuickView" onClick={e=>e.stopPropagation()}>
        <button className="focalQuickClose" onClick={onClose} aria-label="Close quick view"><X size={18}/></button>
        <div className="focalQuickImage"><StoreImage src={image} alt={product.name} eager/></div>
        <div className="focalQuickInfo">
          <span className="focalEyebrow">{product.vendor||product.category?.name||'PRODUCT'}</span>
          <h2>{product.name}</h2>
          <div className="focalPrice big">{money(value,theme.currency||'USD')}</div>
          <p>{product.shortDescription||product.description||''}</p>
          {product.variants?.length>0&&<div className="focalVariantList">{product.variants.map((v:any)=><button key={v.id} className={variantId===v.id?'selected':''} onClick={()=>setVariantId(v.id)}>{v.name}</button>)}</div>}
          <div className="focalQty">
            <button onClick={()=>setQty(Math.max(1,qty-1))} aria-label="Decrease quantity"><Minus size={14}/></button>
            <span>{qty}</span>
            <button onClick={()=>setQty(Math.min(99,qty+1))} aria-label="Increase quantity"><Plus size={14}/></button>
          </div>
          <button className={`focalButton primary wide ${added?'addedSuccess':''}`} onClick={handleAdd}>
            {added ? <>Added to cart <Check size={16}/></> : <>Add to cart <ShoppingBag size={16}/></>}
          </button>
          <Link className="focalButton secondary wide" href={`/product/${product.slug}`} onClick={onClose}>View full product</Link>
        </div>
      </div>
    </div>
  );
}
function CollectionToolbar({products,onChange}:{products:AnyMap[];onChange:(next:AnyMap[])=>void}){const categories=Array.from(new Set(products.map(p=>p.category?.name).filter(Boolean))) as string[];const [q,setQ]=useState('');const [cat,setCat]=useState('');const [sort,setSort]=useState('featured');useEffect(()=>{let next=products.filter(p=>!q||String(p.name).toLowerCase().includes(q.toLowerCase())||String(p.vendor||'').toLowerCase().includes(q.toLowerCase()));if(cat)next=next.filter(p=>p.category?.name===cat);next=[...next].sort((a,b)=>sort==='price-low'?Number(a.basePrice)-Number(b.basePrice):sort==='price-high'?Number(b.basePrice)-Number(a.basePrice):sort==='newest'?new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime():Number(b.featured)-Number(a.featured));onChange(next)},[q,cat,sort,products,onChange]);return <div className="focalCollectionToolbar"><div className="focalToolbarSearch"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products" aria-label="Search products"/></div><select value={cat} onChange={e=>setCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></div>}
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
          <span className="focalEyebrow">{product.vendor||product.category?.name||'PRODUCT'}</span>
          <h1>{product.name}</h1>
          <div className="focalRating">★★★★★ <span>{product.reviews?.length||0} reviews</span></div>
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
            <span className="focalStockDot"/> In stock · Ships within 24 hours · Free delivery &gt; $50
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
            <span>✓ Free shipping &gt; $50</span>
          </div>
          <div className="focalAccordions">
            <details open><summary>Description<ChevronDown size={16}/></summary><p>{product.description||product.shortDescription||''}</p></details>
            <details><summary>Shipping & returns<ChevronDown size={16}/></summary><p>{s.shippingText||'Free standard delivery is automatically applied to orders over $50. Tracked shipping worldwide.'}</p></details>
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
function CountdownSection({section,theme,preview,click}:{section:AnyMap;theme:AnyMap;preview?:boolean;click:(id:string,e:React.MouseEvent)=>void}){
  const s=section.settings||{}
  const commonStyle={...sectionStyle(theme,s),paddingTop:Number(s.spacing??72),paddingBottom:Number(s.spacing??72)}
  const commonClass=shellClass(s,'countdown')
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
    </section>
  )
}
export default function StorefrontSections({theme,sections,products=[],collections=[],product=null,currentCollection=null,preview=false,selectedId,onSelect}:Props){const [quickProduct,setQuickProduct]=useState<AnyMap|null>(null);const [filteredCollectionProducts,setFilteredCollectionProducts]=useState<AnyMap[]|null>(null);const [wishlist,setWishlist]=useState<Record<string,boolean>>({});useEffect(()=>{let alive=true;(async()=>{try{const response=await fetch('/api/wishlist',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const next:Record<string,boolean>={};for(const item of Array.isArray(data.items)?data.items:[])if(item?.productId)next[item.productId]=true;if(alive)setWishlist(next)}catch{}})();return()=>{alive=false}},[]);useEffect(()=>{let alive=true;(async()=>{try{const response=await fetch('/api/wishlist',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const next:Record<string,boolean>={};for(const item of Array.isArray(data.items)?data.items:[])if(item?.productId)next[item.productId]=true;if(alive)setWishlist(next)}catch{}})();return()=>{alive=false}},[]);const activeProduct=product||products[0]||null;const activeCollection=currentCollection||collections[0]||null;const visible=(sections||[]).filter((s:any)=>s&&s.enabled!==false&&s.settings?.enabled!==false&&s.type!=='header'&&s.type!=='announcement');useEffect(()=>{if(!activeProduct||typeof window==='undefined')return;try{const key='ecom-recent-products-v1';const raw=JSON.parse(localStorage.getItem(key)||'[]');const next=[activeProduct.id,...raw.filter((id:any)=>id!==activeProduct.id)].slice(0,12);localStorage.setItem(key,JSON.stringify(next))}catch{}},[activeProduct]);const toggleWish=async(id:string)=>{const previous=Boolean(wishlist[id]);setWishlist(w=>({...w,[id]:!previous}));try{const response=await fetch('/api/wishlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:id})});if(!response.ok){setWishlist(w=>({...w,[id]:previous}))}}catch{setWishlist(w=>({...w,[id]:previous}))}};const click=(id:string,e:React.MouseEvent)=>{if(preview){e.preventDefault();e.stopPropagation();onSelect?.(id)}};return <div className={preview?'focalStorefront themeEditorPreview':'focalStorefront'}>{preview&&<style>{`.themeEditorPreview .focalProductDetail{grid-template-columns:minmax(0,0.9fr) minmax(320px,0.8fr);gap:42px;align-items:start;max-width:1160px}.themeEditorPreview .focalProductGallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start}.themeEditorPreview .focalProductGallery img{width:100%;aspect-ratio:1/1;max-height:420px;object-fit:cover;border-radius:10px;display:block}.themeEditorPreview .focalProductGallery img:nth-child(n+5){display:none}.themeEditorPreview .focalProductInfo{max-width:560px}.themeEditorPreview .focalProductInfo h1{font-size:clamp(30px,3.2vw,52px);line-height:1.02;margin:8px 0 14px}.themeEditorPreview .focalProductInfo>p{max-width:52ch;line-height:1.6}.themeEditorPreview .focalProductInfo .focalPrice.big{font-size:28px}.themeEditorPreview .focalProductOptions{margin-top:18px}.themeEditorPreview .focalAccordions{margin-top:22px}.themeEditorPreview .themeEditorFooter{margin-top:0}.themeEditorPreview .focalType-featured_product .focalProductMedia{max-height:520px}.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:520px;aspect-ratio:4/5;object-fit:cover}@media(max-width:850px){.themeEditorPreview .focalType-featured_product .focalProductMedia,.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:360px}}@media(max-width:560px){.themeEditorPreview .focalType-featured_product .focalProductMedia,.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:300px}}.themeEditorPreview .focalType-featured_product .focalProductMedia{max-height:520px}.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:520px;aspect-ratio:4/5;object-fit:cover}@media(max-width:850px){.themeEditorPreview .focalType-featured_product .focalProductMedia,.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:360px}}@media(max-width:560px){.themeEditorPreview .focalType-featured_product .focalProductMedia,.themeEditorPreview .focalType-featured_product .focalProductMedia img{max-height:300px}}.themeEditorPreview .themeEditorFooter .footer{padding-top:64px;padding-bottom:64px}@media(max-width:850px){.themeEditorPreview .focalProductDetail{grid-template-columns:1fr;gap:28px}.themeEditorPreview .focalProductGallery{grid-template-columns:repeat(2,minmax(0,1fr))}.themeEditorPreview .focalProductGallery img{max-height:280px}.themeEditorPreview .focalProductGallery img:nth-child(n+5){display:none}.themeEditorPreview .focalProductInfo h1{font-size:34px}.themeEditorPreview .themeEditorFooter .footer{padding-top:44px;padding-bottom:44px}}@media(max-width:560px){.themeEditorPreview .focalProductGallery{grid-template-columns:1fr 1fr;gap:8px}.themeEditorPreview .focalProductGallery img{max-height:210px}.themeEditorPreview .focalProductInfo h1{font-size:30px}}`}</style>}{visible.map((section:any)=>{const s=section.settings||{};const selected=preview&&selectedId===section.id;const type=section.type;const commonStyle={...sectionStyle(theme,s),paddingTop:type==='hero'?0:Number(s.spacing??72),paddingBottom:type==='hero'?0:Number(s.spacing??72)};const commonClass=`${shellClass(s,type)} ${selected?'isSelected':''}`
if(type==='hero'){const desktop=img(s.imageUrl||s.desktopImageUrl||s.mobileImageUrl);const mobile=img(s.mobileImageUrl||s.imageUrl||s.desktopImageUrl);const overlayColor=s.overlayColor||'#000000';const raw=overlayColor.replace('#','');const hex=raw.length===3?raw.split('').map((x:string)=>x+x).join(''):raw;const r=parseInt(hex.slice(0,2),16)||0,g=parseInt(hex.slice(2,4),16)||0,b=parseInt(hex.slice(4,6),16)||0;const op=Math.max(0,Math.min(1,Number(s.overlay??.24)));const overlay=s.overlayStyle==='bottom-gradient'?`linear-gradient(to top,rgba(${r},${g},${b},${op}),transparent 72%)`:s.overlayStyle==='full-gradient'?`linear-gradient(135deg,rgba(${r},${g},${b},${op}),rgba(${r},${g},${b},${op*.35}))`:s.overlayStyle==='none'?'none':`rgba(${r},${g},${b},${op})`;const adapt=s.imageHeightMode!=='fixed'&&s.heightMode!=='fixed';return <section key={section.id} className={`focalSection focalType-hero heroSection ${selected?'isSelected':''}`} style={{...sectionStyle(theme,s),padding:0}} onClick={e=>click(section.id,e)}><div className={`focalHero ${s.fullBleed===false?'heroContained':''}`} style={{minHeight:adapt?undefined:Number(s.minHeight||s.customHeight||640),aspectRatio:adapt&&desktop?'16/7':undefined,borderRadius:Number(s.borderRadius||0)}}>{desktop&&<><picture className="focalHeroMedia"><source media="(max-width:749px)" srcSet={mobile||desktop}/><StoreImage className="focalHeroImage" src={desktop} alt={s.imageAlt||s.heading||theme.brandName} eager /></picture><div className="focalHeroOverlay" style={{background:overlay}}/></>}{!desktop&&<div className="focalHeroPlaceholder"/>}<div className={`focalHeroContent ${s.contentBox?'boxed':''} pos-${s.contentPosition||'center-left'}`} style={{textAlign:s.textAlign||'left',maxWidth:Number(s.contentWidth||620)}}><span className="focalPill"><span className="heroDot"/> {s.eyebrow||'NEW COLLECTION'}</span><h1>{s.heading||'Make your store impossible to ignore.'}</h1><p>{s.text||''}</p><div className="focalButtons"><Link href={s.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel||'Shop now'} <ArrowRight size={16}/></Link>{s.secondaryLabel&&<Link href={s.secondaryUrl||'/collections'} className="focalButton secondary" onClick={preview?e=>e.stopPropagation():undefined}>{s.secondaryLabel}</Link>}</div></div></div></section>}
if(type==='slideshow'){const slides=section.blocks||[];const slide=slides[0]?.settings||{};return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalSlideshow"><div className="focalSlide" style={{minHeight:Number(s.minHeight||560)}}>{slide.imageUrl&&<StoreImage src={slide.imageUrl} alt={slide.imageAlt||slide.heading||''} eager/>}<div className="focalSlideShade"/><div className="focalSlideCopy"><span className="focalPill">{slide.eyebrow||'FEATURED'}</span><h2>{slide.heading||s.heading||'Featured'}</h2><p>{slide.text||s.subheading||''}</p>{slide.buttonLabel&&<Link href={slide.buttonUrl||'/shop'} className="focalButton primary" onClick={preview?e=>e.stopPropagation():undefined}>{slide.buttonLabel}</Link>}</div><div className="focalSlideDots">{slides.slice(0,6).map((_:any,i:number)=><span key={i} className={i===0?'active':''}/>)}</div></div></div></section>}
if(type==='video')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalVideo"><div className="focalVideoMedia" style={s.imageUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url(${img(s.imageUrl)})`}:undefined}><span className="focalPlay"><Play size={20}/></span></div><div className="focalVideoCopy"><span className="focalEyebrow">VIDEO</span><h2>{s.heading||'Watch the story'}</h2><p>{s.text||''}</p></div></div></section>
if(type==='image_with_text')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className={`focalContainer focalImageText ${s.layout||'image-right'}`}><div className="focalImageTextMedia">{s.imageUrl&&<StoreImage src={s.imageUrl} alt={s.imageAlt||''}/>}</div><div className="focalImageTextCopy"><span className="focalEyebrow">{s.eyebrow||'THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p>{s.buttonLabel&&<Link className="focalButton primary" href={s.buttonUrl||'#'} onClick={preview?e=>e.stopPropagation():undefined}>{s.buttonLabel}</Link>}</div></div></section>
if(['product_grid','product_carousel','featured_product','product_recommendations'].includes(type)){const source=s.collection?products.filter((p:any)=>(p.collections||[]).some((x:any)=>x.collection?.id===s.collection||x.collection?.slug===s.collection||x.collectionId===s.collection)):products;const items=source.slice(0,Number(s.limit||8));return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{type==='product_recommendations'?'RECOMMENDED':'SHOP / CURATED'}</span><h2>{s.heading||'Featured products'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div>{s.showViewAll!==false&&<Link href="/shop" className="focalTextLink">View all <ChevronRight size={15}/></Link>}</div><div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{items.map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>}
if(type==='collection_grid'||type==='collection_carousel'){const selectedCollections=s.collectionIds?.length?collections.filter((c:any)=>s.collectionIds.includes(c.id)||s.collectionIds.includes(c.slug)):s.sourceCollection?collections.filter((c:any)=>c.id===s.sourceCollection||c.slug===s.sourceCollection):collections;return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">COLLECTIONS</span><h2>{s.heading||'Shop by collection'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div><Link href="/collections" className="focalTextLink">All collections <ChevronRight size={15}/></Link></div><div className="focalCollectionGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),5)},minmax(0,1fr))`}}>{selectedCollections.slice(0,Number(s.limit||4)).map((c:any)=><CollectionCard c={c} key={c.id} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>}
if(type==='main_collection_banner'){const c=activeCollection;return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalCollectionHero"><div className="focalCollectionHeroCopy"><span className="focalEyebrow">COLLECTION</span><h2>{s.heading||c?.name||'Collection'}</h2><p>{s.text||s.subheading||c?.description||''}</p></div>{(s.imageUrl||c?.imageUrl)&&<div className="focalCollectionHeroImage"><StoreImage src={s.imageUrl||c?.imageUrl} alt={c?.name||''}/></div>}</div></section>}
if(type==='main_collection_grid'){const c=activeCollection;const source=c?.products?.map((x:any)=>x.product||x)||products;const visibleProducts=filteredCollectionProducts||source;return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{c?.name||'COLLECTION'}</span><h2>{s.heading||'Products'}</h2></div><span className="focalResultCount">{visibleProducts.length} products</span></div>{s.showFilters!==false&&<CollectionToolbar products={source} onChange={setFilteredCollectionProducts}/>}<div className="focalProductGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{visibleProducts.slice(0,Number(s.limit||24)).map((p:any)=><ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} preview={preview} onSelect={()=>onSelect?.(section.id)}/>)}</div></div></section>}
if(type==='multicolumn')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">BENEFITS</span><h2>{s.heading||'Why shop with us?'}</h2></div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article key={b.id}><div className="focalColumnIcon">✦</div><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></article>)}</div></div></section>
if(type==='promo_grid')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">FEATURED</span><h2>{s.heading||'Shop the edit'}</h2></div></div><div className="focalPromoGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),4)},1fr)`}}>{(section.blocks||[]).map((b:any)=><Link key={b.id} href={b.settings?.url||'#'} className="focalPromoCard" onClick={preview?e=>e.stopPropagation():undefined}><div className="focalPromoMedia" style={b.settings?.imageUrl?{backgroundImage:`url(${img(b.settings.imageUrl)})`}:undefined}><span>Explore <ArrowRight size={14}/></span></div><h3>{b.settings?.heading}</h3><p>{b.settings?.text}</p></Link>)}</div></div></section>
if(type==='testimonials')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">REVIEWS</span><h2>{s.heading||'Loved by customers'}</h2>{s.subheading&&<p>{s.subheading}</p>}</div></div><div className="focalColumns" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||3),3)},1fr)`}}>{(section.blocks||[]).map((b:any)=><article className="focalQuote" key={b.id}><div className="focalStars">{Array.from({length:5}).map((_,i)=><Star size={14} fill="currentColor" key={i} opacity={i<Number(b.settings?.rating||5)?1:.22}/>)}</div><p>“{b.settings?.quote||''}”</p><strong>{b.settings?.author||''}</strong><span>{b.settings?.role||''}</span></article>)}</div></div></section>
if(type==='logo_list')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalLogoStrip">{(section.blocks||[]).map((b:any)=><div className="focalLogo" key={b.id}>{b.settings?.imageUrl?<StoreImage src={b.settings.imageUrl} alt={b.settings?.alt||b.settings?.text||'Brand'}/>:<span>{b.settings?.text||'Brand'}</span>}</div>)}</div></div></section>
if(type==='faq')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalFaq"><div><span className="focalEyebrow">FAQ</span><h2>{s.heading||'Frequently asked questions'}</h2></div><div className="focalFaqList">{(section.blocks||[]).map((b:any)=><details key={b.id}><summary>{b.settings?.question}<ChevronDown size={16}/></summary><p>{b.settings?.answer}</p></details>)}</div></div></section>
if(type==='rich_text')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer focalRich"><span className="focalEyebrow">{s.eyebrow||'ABOUT THE BRAND'}</span><h2>{s.heading||'Tell your story.'}</h2><p>{s.text||''}</p></div></section>
if(type==='newsletter')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className={`focalNewsletter ${s.background||'primary'}`}><div><span className="focalEyebrow">NEWSLETTER</span><h2>{s.heading||'Stay in the loop'}</h2><p>{s.text||''}</p></div><form className="focalNewsletterForm" onSubmit={e=>e.preventDefault()}><input type="email" placeholder="Email address"/><button className="focalButton primary" type="submit">{s.buttonLabel||'Subscribe'}</button></form></div></div></section>
if(type==='trust_badges')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalTrustBadges">{(section.blocks||[]).map((b:any)=>{const Icon=TRUST_ICONS[b.settings?.icon]||ShieldCheck;return <div className="focalTrustBadge" key={b.id}><Icon size={22}/><strong>{b.settings?.heading}</strong>{b.settings?.text&&<span>{b.settings.text}</span>}</div>})}</div></div></section>
if(type==='stats')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">BY THE NUMBERS</span><h2>{s.heading||'Trusted by thousands'}</h2></div></div><div className="focalStatsGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||4),6)},minmax(0,1fr))`}}>{(section.blocks||[]).map((b:any)=><div className="focalStat" key={b.id}><strong>{b.settings?.value}</strong><span>{b.settings?.label}</span></div>)}</div></div></section>
if(type==='social_grid')return <section key={section.id} className={commonClass} style={commonStyle} onClick={e=>click(section.id,e)}><div className="focalContainer"><div className="focalSectionHead"><div><span className="focalEyebrow">{s.handle||'FOLLOW US'}</span><h2>{s.heading||'Shop the feed'}</h2></div></div><div className="focalSocialGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(s.columns||5),6)},minmax(0,1fr))`}}>{(section.blocks||[]).map((b:any)=><Link key={b.id} href={b.settings?.url||'#'} className="focalSocialItem" onClick={preview?(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation()}:undefined}>{b.settings?.imageUrl&&<StoreImage src={b.settings.imageUrl} alt=""/>}</Link>)}</div></div></section>
if(type==='countdown')return <CountdownSection key={section.id} section={section} theme={theme} preview={preview} click={click}/>
if(type==='main_product')return <MainProductSection key={section.id} section={section} theme={theme} product={activeProduct} preview={preview} selected={selected} onSelect={onSelect} wishlist={wishlist} toggleWish={toggleWish}/>
return null})}{preview&&(sections||[]).some((s:any)=>s&&s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false)&&<div className="themeEditorFooter"><Footer/></div>}{quickProduct&&<QuickView product={quickProduct} theme={theme} onClose={()=>setQuickProduct(null)}/>}</div>}
