'use client'

// Homepage sections of the "market" storefront (see lib/storefront-market.ts). Each one is
// edited in the theme studio like any other section, and every product row hides itself
// (on the live store) until there are enough products to fill it, so a small catalog never
// shows half-empty rows.
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ProductCard, StoreImage, img, money } from '@/components/storefront-sections'
import { useCart } from '@/components/cart-provider'

type AnyMap = Record<string, any>
type Common = {
  section: AnyMap
  theme: AnyMap
  products: AnyMap[]
  collections: AnyMap[]
  preview?: boolean
  selected?: boolean
  click: (id: string, e: React.MouseEvent) => void
  onQuickView: (p: AnyMap) => void
  onSelect?: () => void
  wishlist: Record<string, boolean>
  toggleWish: (id: string) => void
}

const n = (v: any, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d)
const sold = (p: AnyMap) => Number(p.soldCount || 0)
const onSale = (p: AnyMap) => Number(p.compareAtPrice || 0) > Number(p.basePrice || 0)
const newest = (list: AnyMap[]) => [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
const bestOf = (list: AnyMap[]) => [...list].filter(p => sold(p) > 0).sort((a, b) => sold(b) - sold(a))
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Hidden({ preview, name, reason, id, selected, click }: { preview?: boolean; name: string; reason: string; id: string; selected?: boolean; click: Common['click'] }) {
  if (!preview) return null
  return <section className={`themeEmptyNotice ${selected ? 'isSelected' : ''}`} onClick={e => click(id, e)}><div className="focalContainer"><strong>{name} is hidden on your store</strong><span>{reason}</span><em>It appears automatically once there are enough products.</em></div></section>
}

function Head({ heading, sub, right }: { heading: string; sub?: string; right?: React.ReactNode }) {
  return <div className="mkHead"><div><h2>{heading}</h2>{sub ? <p>{sub}</p> : null}</div>{right}</div>
}

/* ---------------- Hero slider (full photo, or split) ---------------- */
export function HeroSlider({ section, preview, selected, click }: Pick<Common, 'section' | 'preview' | 'selected' | 'click'>) {
  const s = section.settings || {}
  const slides: AnyMap[] = (section.blocks || []).filter((b: AnyMap) => b && (b.settings?.heading || b.settings?.imageUrl))
  const layout = s.layout === 'split' ? 'split' : 'full'
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const go = (i: number) => setIndex(((i % count) + count) % count)
  useEffect(() => {
    // Never rotates in the theme editor, so the slide being edited stays on screen.
    if (count < 2 || s.autoplay === false || paused || preview || reduceMotion()) return
    const t = window.setInterval(() => setIndex(i => (i + 1) % count), Math.max(3, n(s.speed, 5)) * 1000)
    return () => window.clearInterval(t)
  }, [count, s.autoplay, s.speed, paused, preview])
  const touch = useRef<number | null>(null)
  if (!count) return <Hidden preview={preview} name="Hero slider" reason="It has no slides." id={section.id} selected={selected} click={click} />
  const style = { '--mk-hero-h': `${n(s.height, 560)}px`, '--mk-hero-hm': `${n(s.mobileHeight, 460)}px` } as React.CSSProperties
  return (
    <section
      className={`mkHero mkHero-${layout} ${selected ? 'isSelected' : ''}`}
      style={style}
      onClick={e => click(section.id, e)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={e => { touch.current = e.touches[0].clientX }}
      onTouchEnd={e => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1)); touch.current = null }}
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      <div className="mkHeroFrame">
        <div className="mkHeroTrack" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((b, i) => {
            const t = b.settings || {}
            const copy = (
              <div className="mkSlideCopy">
                {t.tag ? <span className="mkTag">{t.tag}</span> : null}
                {/* The first slide's heading is the page's main heading. */}
                {i === 0
                  ? <h1>{t.heading}{t.highlight ? <> <span>{t.highlight}</span></> : null}</h1>
                  : <h2>{t.heading}{t.highlight ? <> <span>{t.highlight}</span></> : null}</h2>}
                {t.text ? <p>{t.text}</p> : null}
                {(t.buttonLabel || t.secondaryLabel) && (
                  <div className="mkBtns">
                    {t.buttonLabel ? <Link className="mkBtn mkBtnPrimary" href={t.buttonUrl || '/shop'}>{t.buttonLabel}</Link> : null}
                    {t.secondaryLabel ? <Link className="mkBtn mkBtnGhost" href={t.secondaryUrl || '/collections'}>{t.secondaryLabel}</Link> : null}
                  </div>
                )}
              </div>
            )
            const picture = t.imageUrl ? (
              <picture className="mkSlidePic">
                {t.mobileImageUrl ? <source media="(max-width: 760px)" srcSet={img(t.mobileImageUrl)} /> : null}
                <img src={img(t.imageUrl)} alt={t.imageAlt || ''} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} decoding="async" />
              </picture>
            ) : <div className="mkSlidePic mkSlidePicEmpty" />
            return (
              <div className="mkSlide" key={b.id || i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} aria-hidden={i !== index}>
                {layout === 'full'
                  ? <>{picture}<span className="mkSlideShade" /><div className="mkWrap mkSlideInner">{copy}</div>{t.badge ? <span className="mkSlideBadge">{t.badge}</span> : null}</>
                  : <><div className="mkSplitCopy">{copy}</div><div className="mkSplitPic">{picture}{t.badge ? <span className="mkSlideBadge">{t.badge}</span> : null}</div></>}
              </div>
            )
          })}
        </div>
        {count > 1 && <>
          <button type="button" className="mkArrow mkArrowPrev" aria-label="Previous slide" onClick={e => { e.stopPropagation(); go(index - 1) }}><ChevronLeft size={20} /></button>
          <button type="button" className="mkArrow mkArrowNext" aria-label="Next slide" onClick={e => { e.stopPropagation(); go(index + 1) }}><ChevronRight size={20} /></button>
          <div className="mkDots">{slides.map((b, i) => <button type="button" key={b.id || i} aria-label={`Show slide ${i + 1}`} aria-current={i === index} onClick={e => { e.stopPropagation(); go(i) }} />)}</div>
        </>}
      </div>
    </section>
  )
}

/* ---------------- Offer banners ---------------- */
export function OfferBanners({ section, preview, selected, click }: Pick<Common, 'section' | 'preview' | 'selected' | 'click'>) {
  const offers: AnyMap[] = (section.blocks || []).filter((b: AnyMap) => b?.settings?.heading || b?.settings?.imageUrl)
  if (!offers.length) return <Hidden preview={preview} name="Offer banners" reason="It has no banners." id={section.id} selected={selected} click={click} />
  return (
    <section className={`mkSection mkOffersSec ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className={`mkWrap mkOffers mkOffers-${Math.min(offers.length, 3)}`}>
        {offers.map((b, i) => {
          const t = b.settings || {}
          return (
            <Link key={b.id || i} className="mkOffer" href={t.url || '/shop'}>
              {t.imageUrl ? <StoreImage className="mkCover" src={t.imageUrl} alt="" /> : null}
              <span className="mkOfferText">
                {t.kicker ? <small>{t.kicker}</small> : null}
                <b>{t.heading}</b>
                {t.linkLabel ? <u>{t.linkLabel}</u> : null}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Cards({ items, c, rank }: { items: AnyMap[]; c: Common; rank?: boolean }) {
  return <>{items.map((p, i) => (
    <div className="mkCardSlot" key={p.id}>
      {rank ? <span className="mkRank">#{i + 1}</span> : null}
      <ProductCard p={p} theme={c.theme} onQuickView={c.onQuickView} preview={c.preview} onSelect={c.onSelect} wishlist={c.wishlist} toggleWish={c.toggleWish} />
    </div>
  ))}</>
}

/* ---------------- Product tabs: deals / best sellers / new ---------------- */
export function ProductTabs(c: Common) {
  const { section, products, preview, selected, click } = c
  const s = section.settings || {}
  const limit = n(s.limit, 10)
  const lists = useMemo(() => {
    const out: { key: string; label: string; items: AnyMap[] }[] = []
    const deals = products.filter(onSale).sort((a, b) => (Number(b.compareAtPrice) - Number(b.basePrice)) / Number(b.compareAtPrice) - (Number(a.compareAtPrice) - Number(a.basePrice)) / Number(a.compareAtPrice))
    const best = bestOf(products)
    if (s.showDeals !== false && deals.length) out.push({ key: 'deals', label: s.dealsLabel || 'Deals', items: deals })
    if (s.showBest !== false) out.push(best.length ? { key: 'best', label: s.bestLabel || 'Best sellers', items: best } : { key: 'popular', label: 'Popular', items: products })
    if (s.showNew !== false) out.push({ key: 'new', label: s.newLabel || 'New', items: newest(products) })
    return out.filter(l => l.items.length)
  }, [products, s.showDeals, s.showBest, s.showNew, s.dealsLabel, s.bestLabel, s.newLabel])
  const [tab, setTab] = useState(0)
  const active = lists[Math.min(tab, lists.length - 1)]
  if (!lists.length || products.length < n(s.minProducts, 4)) return <Hidden preview={preview} name={s.heading || 'Product tabs'} reason={`Your store has ${products.length} product${products.length === 1 ? '' : 's'}; this row needs ${n(s.minProducts, 4)}.`} id={section.id} selected={selected} click={click} />
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={s.heading || "Today's deals"} sub={s.subheading} right={lists.length > 1 ? (
          <div className="mkTabs" role="tablist">
            {lists.map((l, i) => <button type="button" role="tab" key={l.key} aria-selected={l === active} onClick={e => { e.stopPropagation(); setTab(i) }}>{l.label}</button>)}
          </div>
        ) : null} />
        <div className="mkGrid"><Cards items={active.items.slice(0, limit)} c={c} /></div>
      </div>
    </section>
  )
}

/* ---------------- Product rail (sliding row) ---------------- */
export function ProductRail(c: Common) {
  const { section, products, collections, preview, selected, click } = c
  const s = section.settings || {}
  const source = s.source || 'best'
  const { items, ranked } = useMemo(() => {
    if (source === 'new') return { items: newest(products), ranked: false }
    if (source === 'sale') return { items: products.filter(onSale), ranked: false }
    if (source === 'collection' && s.collection) {
      const col = collections.find((x: AnyMap) => x.id === s.collection || x.slug === s.collection)
      const ids = new Set((col?.products || []).map((x: AnyMap) => x.productId))
      return { items: products.filter(p => ids.has(p.id) || (p.collections || []).some((x: AnyMap) => x.collection?.id === s.collection || x.collection?.slug === s.collection || x.collectionId === s.collection)), ranked: false }
    }
    // Until enough products have sold to fill the row, it shows "Popular right now" instead.
    const best = bestOf(products)
    return best.length >= n(s.minProducts, 4) ? { items: best, ranked: s.showRank !== false } : { items: products, ranked: false }
  }, [products, collections, source, s.collection, s.showRank, s.minProducts])
  const track = useRef<HTMLDivElement>(null)
  const list = items.slice(0, n(s.limit, 12))
  if (list.length < n(s.minProducts, 4)) return <Hidden preview={preview} name={s.heading || 'Product row'} reason={`It has ${list.length} product${list.length === 1 ? '' : 's'}; it needs ${n(s.minProducts, 4)}.`} id={section.id} selected={selected} click={click} />
  const noSalesYet = source === 'best' && !ranked
  const heading = noSalesYet ? (s.emptyHeading || 'Popular right now') : (s.heading || 'Best sellers')
  const scroll = (dir: number) => { const el = track.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduceMotion() ? 'auto' : 'smooth' }) }
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={heading} sub={noSalesYet ? undefined : s.subheading} right={
          <div className="mkRailNav">
            <button type="button" aria-label="Scroll left" onClick={e => { e.stopPropagation(); scroll(-1) }}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="Scroll right" onClick={e => { e.stopPropagation(); scroll(1) }}><ChevronRight size={18} /></button>
          </div>
        } />
        <div className="mkRail" ref={track}><Cards items={list} c={c} rank={ranked} /></div>
      </div>
    </section>
  )
}

/* ---------------- Category spotlight: banner + that collection's products ---------------- */
export function CategorySpotlight(c: Common) {
  const { section, products, collections, preview, selected, click } = c
  const s = section.settings || {}
  const need = n(s.minProducts, 2)
  const membersOf = (col: AnyMap | undefined) => {
    if (!col) return []
    const ids = new Set((col.products || []).map((x: AnyMap) => x.productId))
    return products.filter(p => ids.has(p.id) || (p.collections || []).some((x: AnyMap) => x.collection?.id === col.id || x.collectionId === col.id))
  }
  const chosen = s.collection ? collections.find((x: AnyMap) => x.id === s.collection || x.slug === s.collection) : collections.find((x: AnyMap) => membersOf(x).length >= need)
  const items = membersOf(chosen).slice(0, n(s.limit, 4))
  if (!chosen || items.length < need) return <Hidden preview={preview} name="Category spotlight" reason={chosen ? `"${chosen.name}" has ${items.length} product${items.length === 1 ? '' : 's'}; it needs ${need}.` : 'No collection has enough products yet.'} id={section.id} selected={selected} click={click} />
  const href = `/collections/${chosen.slug}`
  const banner = (
    <Link className="mkSpotBanner" href={href}>
      <StoreImage className="mkCover" src={s.imageUrl || chosen.imageUrl || '/placeholder-product.svg'} alt="" />
      <span className="mkSpotText">
        {s.kicker ? <small>{s.kicker}</small> : null}
        <b>{s.bannerHeading || chosen.name}</b>
        <span className="mkBtn mkBtnWhite">{s.buttonLabel || 'Shop now'}</span>
      </span>
    </Link>
  )
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={s.heading || chosen.name} right={<Link className="mkLink" href={href}>Shop all</Link>} />
        <div className={`mkSpot ${s.bannerPosition === 'right' ? 'mkSpotRight' : ''}`}>
          {banner}
          <div className="mkSpotGrid"><Cards items={items} c={c} /></div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- Shop by price ---------------- */
export function ShopByPrice(c: Common) {
  const { section, products, preview, selected, click } = c
  const s = section.settings || {}
  const bands: AnyMap[] = (section.blocks || []).map((b: AnyMap) => b.settings || {}).filter((b: AnyMap) => b.label)
  const [active, setActive] = useState(0)
  const band = bands[Math.min(active, bands.length - 1)]
  const items = band ? products.filter(p => { const price = Number(p.basePrice || 0) / 100; const min = n(band.min, 0); const max = n(band.max, 0); return price >= min && (max <= 0 || price < max) }) : []
  if (!bands.length || products.length < n(s.minProducts, 2)) return <Hidden preview={preview} name="Shop by price" reason="There are not enough products yet." id={section.id} selected={selected} click={click} />
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={s.heading || 'Shop by price'} />
        <div className="mkChips" role="group" aria-label="Price range">
          {bands.map((b, i) => <button type="button" key={i} aria-pressed={i === active} onClick={e => { e.stopPropagation(); setActive(i) }}>{b.label}</button>)}
        </div>
        {items.length ? <div className="mkRail"><Cards items={items.slice(0, n(s.limit, 10))} c={c} /></div> : <p className="mkEmpty">Nothing in this price range yet.</p>}
      </div>
    </section>
  )
}

/* ---------------- Recently viewed (this browser only) ---------------- */
export function RecentlyViewed({ section, theme, products, preview, selected, click }: Common) {
  const s = section.settings || {}
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => { try { const raw = JSON.parse(localStorage.getItem('ecom-recent-products-v1') || '[]'); if (Array.isArray(raw)) setIds(raw.map(String)) } catch {} }, [])
  const items = ids.map(id => products.find(p => p.id === id)).filter(Boolean).slice(0, n(s.limit, 6)) as AnyMap[]
  if (items.length < 2) return <Hidden preview={preview} name="Recently viewed" reason="It only shows to shoppers who have viewed at least two products." id={section.id} selected={selected} click={click} />
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={s.heading || 'Recently viewed'} />
        <div className="mkRecent">
          {items.map(p => (
            <Link key={p.id} className="mkRecentItem" href={`/product/${p.slug}`}>
              <StoreImage src={p.images?.[0]?.url} alt="" />
              <span><b>{p.name}</b><span>{money(p.basePrice, theme.currency || 'USD')}</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Bundles (only when the merchant has switched bundles on) ---------------- */
type Bundle = { id: string; name: string; description?: string | null; imageUrl?: string | null; price: number; fullPrice: number; items: { productId: string; variantId?: string | null; quantity: number; name: string; sku: string; price: number; image?: string | null; slug?: string }[] }
export function BundlesSection({ section, theme, preview, selected, click }: Common) {
  const s = section.settings || {}
  const { addItem } = useCart()
  const [bundles, setBundles] = useState<Bundle[] | null>(null)
  const [added, setAdded] = useState('')
  useEffect(() => {
    let live = true
    fetch('/api/bundles', { cache: 'no-store' }).then(r => (r.ok ? r.json() : { bundles: [] })).then(d => { if (live) setBundles(Array.isArray(d?.bundles) ? d.bundles : []) }).catch(() => { if (live) setBundles([]) })
    return () => { live = false }
  }, [])
  if (bundles === null) return null
  if (!bundles.length) return <Hidden preview={preview} name="Bundle & save" reason="Bundles are switched off, or none are active (Products › Bundles)." id={section.id} selected={selected} click={click} />
  const add = (b: Bundle, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (preview) return
    for (const item of b.items) addItem({ productId: item.productId, variantId: item.variantId || null, name: item.name, sku: item.sku, price: item.price, image: item.image ? img(item.image) : undefined, quantity: item.quantity, bundleId: b.id }, false)
    setAdded(b.id); window.setTimeout(() => setAdded(''), 1600)
  }
  const cur = theme.currency || 'USD'
  return (
    <section className={`mkSection ${selected ? 'isSelected' : ''}`} onClick={e => click(section.id, e)}>
      <div className="mkWrap">
        <Head heading={s.heading || 'Bundle & save'} sub={s.subheading} />
        <div className="mkBundles">
          {bundles.slice(0, n(s.limit, 6)).map(b => (
            <article className="mkBundle" key={b.id}>
              <div className="mkBundleThumbs">{b.items.slice(0, 3).map((it, i) => <StoreImage key={i} src={it.image} alt="" />)}</div>
              <h3>{b.name}</h3>
              <ul>{b.items.map((it, i) => <li key={i}>{it.quantity > 1 ? `${it.quantity} × ` : ''}{it.name}</li>)}</ul>
              <div className="mkBundlePrice"><span><b>{money(b.price, cur)}</b>{b.fullPrice > b.price ? <s>{money(b.fullPrice, cur)}</s> : null}</span>{b.fullPrice > b.price ? <em>Save {money(b.fullPrice - b.price, cur)}</em> : null}</div>
              <button type="button" className="mkAdd" onClick={e => add(b, e)}>{added === b.id ? 'Added to cart' : 'Add bundle to cart'}</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
