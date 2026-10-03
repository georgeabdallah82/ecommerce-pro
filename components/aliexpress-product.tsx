'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronDown, ChevronRight, Heart, Minus, Plus, Share2, ShoppingBag, Star } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { useWishlist } from '@/components/use-wishlist'
import StorefrontSections, { ProductCard, QuickView, StarRow, StoreImage, formatSold, img, money } from '@/components/storefront-sections'
import { FreeDeliveryBadge, ShippingNote, merchantShippingText } from '@/components/shipping-note'
import { DELIVERY_AREA_EVENT, readDeliveryArea } from '@/components/market-chrome'
import { parseDeliveryAreas } from '@/lib/storefront-market'

type AnyMap = Record<string, any>

type ReviewEligibility = 'guest' | 'not_purchased' | 'already_reviewed' | 'can_review'

function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return <div className="aliReviewFormDone"><Check size={18} /> Thanks — your review was submitted and will appear once it's approved.</div>
  }

  const submit = async () => {
    if (!rating) { setError('Pick a star rating first.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, title, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Unable to submit review right now'); setSubmitting(false); return }
      setSubmitted(true)
    } catch {
      setError('Unable to submit review right now')
      setSubmitting(false)
    }
  }

  return (
    <div className="aliReviewForm">
      <span className="aliReviewFormLabel">Your rating</span>
      <div className="aliReviewStarPicker" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`} onMouseEnter={() => setHoverRating(n)} onClick={() => setRating(n)}>
            <Star size={22} fill="currentColor" opacity={n <= (hoverRating || rating) ? 1 : 0.22} />
          </button>
        ))}
      </div>
      <input className="aliReviewFormInput" type="text" placeholder="Review title (optional)" maxLength={140} value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="aliReviewFormInput" placeholder="Share details about your experience (optional)" maxLength={2000} rows={4} value={body} onChange={e => setBody(e.target.value)} />
      {error && <p className="aliReviewFormError">{error}</p>}
      <button type="button" className="focalButton primary" disabled={submitting} onClick={submit}>{submitting ? 'Submitting…' : 'Submit review'}</button>
    </div>
  )
}

export default function AliExpressProduct({ theme, product, related, variantAvailability, productAvailable, trackInventory, continueSellingWhenOutOfStock, reviewEligibility, sections = [], collections = [] }: { theme: AnyMap; product: AnyMap; related: AnyMap[]; variantAvailability: Array<{ name: string; sku: string; available: number }>; productAvailable: number; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; reviewEligibility: ReviewEligibility; sections?: AnyMap[]; collections?: AnyMap[] }) {
  const { addItem } = useCart()
  const { wishlist, toggleWish } = useWishlist()
  const router = useRouter()
  // Preselect the first option still for sale.
  const firstOpenVariant = () => {
    const list: AnyMap[] = product.variants || []
    const open = trackInventory && !continueSellingWhenOutOfStock ? list.find((_, i) => (variantAvailability[i]?.available ?? 1) > 0) : list[0]
    return (open || list[0])?.id || null
  }
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(firstOpenVariant)
  const [qty, setQty] = useState(1)
  const [activeImgIndex, setActiveImgIndex] = useState(0)
  const [added, setAdded] = useState(false)
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  const [shared, setShared] = useState(false)
  // Feeds the homepage "Recently viewed" row (this browser only).
  useEffect(() => {
    try {
      const key = 'ecom-recent-products-v1'
      const raw = JSON.parse(localStorage.getItem(key) || '[]')
      const list = Array.isArray(raw) ? raw.map(String) : []
      localStorage.setItem(key, JSON.stringify([product.id, ...list.filter(id => id !== product.id)].slice(0, 12)))
    } catch {}
  }, [product.id])
  const pp = theme.productPage || {}
  const showBreadcrumbs = pp.showBreadcrumbs !== false
  const showVendor = pp.showVendor !== false
  const showReviews = pp.showReviews !== false
  const showShare = pp.showShare !== false
  const showWishlist = pp.showWishlist !== false
  const showShippingAccordion = pp.showShippingAccordion !== false
  const showDescription = pp.showDescription !== false
  const showSpecs = pp.showSpecs !== false
  const showRelated = pp.showRelated !== false
  const relatedLimit = Number(pp.relatedLimit) || 12
  const showTrustBadges = pp.showTrustBadges !== false
  const showStockCounter = pp.showStockCounter !== false
  const showQuantity = pp.showQuantity !== false
  const primaryCollection = product.collections?.[0]?.collection

  useEffect(() => { setSelectedVariantId(firstOpenVariant()); setQty(1); setActiveImgIndex(0) }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const gallery = product.images?.length ? product.images : [{ url: '/placeholder-product.svg', alt: product.name }]
  const variants = product.variants || []
  const selectedVariant = variants.find((v: AnyMap) => v.id === selectedVariantId)
  const currentPrice = Number(selectedVariant?.price ?? product.basePrice ?? 0)
  const compareAt = Number(selectedVariant?.compareAtPrice ?? product.compareAtPrice ?? 0)
  const discountPct = compareAt > currentPrice ? Math.round((1 - currentPrice / compareAt) * 100) : 0
  const activeImage = gallery[activeImgIndex]?.url || gallery[0]?.url || '/placeholder-product.svg'
  const wished = Boolean(wishlist[product.id])

  const selectedVariantIndex = variants.findIndex((v: AnyMap) => v.id === selectedVariantId)
  // Sold-out options stay selectable (so the shopper sees "Out of stock") but look crossed out.
  const optionSoldOut = (v: AnyMap) => trackInventory && !continueSellingWhenOutOfStock && (variantAvailability[variants.indexOf(v)]?.available ?? 1) <= 0
  const available = variants.length ? (variantAvailability[selectedVariantIndex]?.available ?? productAvailable) : productAvailable
  const canSell = !trackInventory || continueSellingWhenOutOfStock || available > 0
  const purchaseAllowed = canSell && (!trackInventory || continueSellingWhenOutOfStock || qty <= available)
  // The delivery time for the area picked in the delivery bar (Theme settings › Delivery bar),
  // instead of a fixed promise. "0 available" never shows for items sold while out of stock.
  const deliveryAreas = theme.design === 'market' && theme.delivery?.enabled !== false ? parseDeliveryAreas(theme.delivery?.areas) : []
  const [deliveryArea, setDeliveryArea] = useState('')
  useEffect(() => {
    const read = () => setDeliveryArea(readDeliveryArea())
    read()
    window.addEventListener(DELIVERY_AREA_EVENT, read)
    return () => window.removeEventListener(DELIVERY_AREA_EVENT, read)
  }, [])
  const area = deliveryAreas.find(a => a.name === deliveryArea) || deliveryAreas[0]
  const deliveryLabel = area?.eta ? `Delivery to ${area.name}: ${area.eta}` : ''
  const stockLabel = !canSell ? 'Out of stock' : [trackInventory && available > 0 ? `${available} available` : 'In stock', deliveryLabel].filter(Boolean).join(' · ')

  const buildItem = () => ({
    productId: product.id,
    variantId: selectedVariant?.id || null,
    // The chosen option is part of the line's name, so two sizes don't look identical in the cart.
    name: selectedVariant?.name ? `${product.name} — ${selectedVariant.name}` : product.name,
    sku: selectedVariant?.sku || product.sku || product.slug,
    price: currentPrice,
    image: img(activeImage),
    quantity: qty,
  })

  const addToCart = () => {
    setAdded(true)
    addItem(buildItem())
    setTimeout(() => setAdded(false), 1500)
  }

  const buyNow = () => {
    addItem(buildItem(), false)
    router.push('/checkout')
  }

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) { await navigator.share({ title: product.name, url }); return }
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1500)
    } catch {}
  }

  const reviews = product.reviews || []
  const avgRating = Number(product.rating || 0)

  return (
    <div className="focalStorefront aliProductPage">
      {showBreadcrumbs && (
        <div className="aliContainer aliBreadcrumbs">
          <Link href="/">Home</Link><ChevronRight size={12} />
          {primaryCollection && <><Link href={`/collections/${primaryCollection.slug}`}>{primaryCollection.name}</Link><ChevronRight size={12} /></>}
          <span>{product.name}</span>
        </div>
      )}
      <div className="aliContainer aliProductLayout">
        <div className="aliProductGallery">
          <div className="aliProductMainImage">
            <StoreImage src={activeImage} alt={gallery[activeImgIndex]?.alt || product.name} eager />
            {discountPct > 0 && <span className="focalBadge aliProductDiscountBadge">-{discountPct}%</span>}
          </div>
          {gallery.length > 1 && (
            <div className="aliProductThumbs">
              {gallery.slice(0, 8).map((im: AnyMap, i: number) => (
                <button key={im.id || i} type="button" className={activeImgIndex === i ? 'active' : ''} onClick={() => setActiveImgIndex(i)} aria-label={`View image ${i + 1}`}>
                  <StoreImage src={im.url} alt={im.alt || product.name} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="aliProductInfo">
          {showVendor && product.vendor && <span className="aliProductVendor">{product.vendor}</span>}
          <h1>{product.name}</h1>
          <div className="aliProductMeta">
            <span className="aliProductRating"><StarRow rating={avgRating} size={14} /> {avgRating > 0 && avgRating.toFixed(1)}</span>
            <span>{reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
            {Number(product.soldCount || 0) > 0 && <span>{formatSold(Number(product.soldCount))}</span>}
          </div>
          <div className="aliProductPrice">
            <strong>{money(currentPrice, theme.currency || 'USD')}</strong>
            {compareAt > currentPrice && <del>{money(compareAt, theme.currency || 'USD')}</del>}
            {discountPct > 0 && <span className="aliProductDiscountPill">-{discountPct}%</span>}
          </div>

          {variants.length > 0 && (
            <div className="aliProductVariants">
              <span>Options</span>
              <div className="aliVariantList">
                {variants.map((v: AnyMap) => (
                  <button key={v.id} className={`${selectedVariantId === v.id ? 'selected' : ''} ${optionSoldOut(v) ? 'soldOut' : ''}`} aria-label={optionSoldOut(v) ? `${v.name} (sold out)` : undefined} onClick={() => setSelectedVariantId(v.id)}>{v.name}</button>
                ))}
              </div>
            </div>
          )}

          {showStockCounter && (
            <div className="focalStock">
              <span className="focalStockDot" style={!canSell ? { background: 'var(--store-muted,#746b64)' } : undefined} /> {stockLabel}
            </div>
          )}

          {showQuantity && (
            <div className="aliQtyRow">
              <span>Quantity</span>
              <div className="focalQty">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
                <span>{qty}</span>
                <button onClick={() => setQty(Math.min(99, qty + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
              </div>
            </div>
          )}

          <div className="aliBuyRow">
            <button className="focalButton aliBuyNow" onClick={buyNow} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : 'This quantity is not available'}>Buy Now</button>
            <button className={`focalButton primary aliAddToCart ${added ? 'addedSuccess' : ''}`} onClick={addToCart} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : 'This quantity is not available'}>
              {added ? <>Added <Check size={16} /></> : <>Add to Cart <ShoppingBag size={16} /></>}
            </button>
            {showWishlist && (
              <button type="button" className={`focalWishlist ${wished ? 'active' : ''}`} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWish(product.id)}>
                <Heart size={18} fill={wished ? 'currentColor' : 'none'} />
              </button>
            )}
            {showShare && (
              <button type="button" className="focalWishlist aliShareButton" aria-label="Share this product" onClick={share}>
                {shared ? <Check size={18} /> : <Share2 size={17} />}
              </button>
            )}
          </div>

          {showTrustBadges && (
            <div className="focalTrustGrid">
              <span>✓ Secure checkout</span>
              <span>✓ Easy returns</span>
              <FreeDeliveryBadge />
            </div>
          )}

          <div className="focalAccordions">
            {showDescription && product.descriptionHtml && <details open><summary>Description<ChevronDown size={16} /></summary><div className="pdpRichText" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} /></details>}
            <details><summary>Product information<ChevronDown size={16} /></summary><p>SKU {selectedVariant?.sku || product.sku || '—'}</p></details>
            {showShippingAccordion && (
              <details><summary>Shipping &amp; returns<ChevronDown size={16} /></summary><p>{merchantShippingText(pp.shippingText) || <ShippingNote />}</p></details>
            )}
            {showSpecs && product.metafields?.length > 0 && (
              <details><summary>Specifications<ChevronDown size={16} /></summary>
                <table className="aliSpecTable">
                  <tbody>
                    {product.metafields.map((m: AnyMap) => (
                      <tr key={m.name}>
                        <th>{m.name}</th>
                        <td>
                          {m.type === 'boolean' ? (m.value === 'true' ? 'Yes' : 'No')
                            : m.isList ? (
                              <span className="aliSpecList">
                                {String(m.value).split(',').map((v: string) => v.trim()).filter(Boolean).map((v: string, i: number) => (
                                  <span className="aliSpecListItem" key={i}>{v}</span>
                                ))}
                              </span>
                            ) : m.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        </div>
      </div>

      {showReviews && (
        <div className="aliContainer aliReviewsSection">
          <h2>Customer Reviews {reviews.length > 0 && <span className="aliReviewAvg"><StarRow rating={avgRating} size={16} /> {avgRating.toFixed(1)} ({reviews.length})</span>}</h2>
          {reviewEligibility === 'can_review' && <ReviewForm productId={product.id} />}
          {reviewEligibility === 'already_reviewed' && <p className="aliReviewFormNote">You've already reviewed this product — thanks for the feedback.</p>}
          {reviewEligibility === 'guest' && <p className="aliReviewFormNote"><Link href="/account/login">Sign in</Link> to write a review after your order is delivered.</p>}
          {reviews.length > 0 ? (
            <div className="aliReviewList">
              {reviews.map((r: AnyMap) => (
                <div className={`aliReviewItem${r.featured ? ' aliReviewFeatured' : ''}`} key={r.id}>
                  <div className="aliReviewHead">
                    <StarRow rating={Number(r.rating || 0)} size={13} />
                    <strong>{r.user?.name || 'Verified buyer'}</strong>
                    {r.featured && <span className="aliReviewFeaturedBadge">Featured</span>}
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.title && <div className="aliReviewTitle">{r.title}</div>}
                  <p>{r.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="aliEmptyState">No reviews yet.</p>
          )}
        </div>
      )}

      {showRelated && related.length > 0 && (
        <div className="aliContainer aliSection">
          <div className="aliSectionHead"><h2>You may also like</h2></div>
          <div className="aliDenseGrid">
            {related.slice(0, relatedLimit).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </div>
      )}

      {/* Merchant-addable content appended below the fixed product layout above --
          the same generic section engine every other admin-editable content
          area uses (components/storefront-sections.tsx), reading
          theme.editorTemplates.Product with the header/announcement/footer/
          main_product placeholder rows filtered out (see app/product/[slug]/
          page.tsx). Everything above this point is the untouched, existing
          product page -- inventory, variants, reviews, buy-now/checkout --
          none of it is affected by what a merchant adds here. */}
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={related} collections={collections} />}

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </div>
  )
}
