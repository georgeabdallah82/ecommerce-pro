'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'
import { dateLocale } from '@/lib/i18n'
import { BadgeCheck, CalendarClock, Check, ChevronDown, ChevronRight, Heart, MessageCircle, MessageSquareText, Minus, Plus, Share2, ShoppingBag, Star, X } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { useWishlist } from '@/components/use-wishlist'
import StorefrontSections, { ProductCard, QuickView, StarRow, StoreImage, formatSold, img, money } from '@/components/storefront-sections'
import { FreeDeliveryBadge, ShippingNote, merchantShippingText } from '@/components/shipping-note'
import { DELIVERY_AREA_EVENT, readDeliveryArea } from '@/components/market-chrome'
import { parseDeliveryAreas } from '@/lib/storefront-market'
import { trackViewContent } from '@/lib/tracking-events'
import StickyBuyBar from './sticky-buy-bar'
import BackInStockButton from '@/components/back-in-stock-button'
import BoughtTogether from '@/components/bought-together'
import type { Suggestion } from '@/lib/recommendations'
import type { PublicDeal } from '@/lib/quantity-deals-shared'
import { lowStockLeft } from '@/lib/selling'
import { FlashCountdown, LbpNote, OccasionNote, QuantityDealsBox } from '@/components/selling-client'
import { salePrice } from '@/lib/flash-sale-shared'
import RecentlyViewedRow from '@/components/recently-viewed-row'
import ProductQuestions from '@/components/product-questions'

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
  const { t } = useI18n()

  if (submitted) {
    return <div className="aliReviewFormDone"><Check size={18} /> {t("Thanks, your review was submitted and will appear once it's approved.")}</div>
  }

  const submit = async () => {
    if (!rating) { setError(t('Pick a star rating first.')); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, title, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t(data.error || 'Unable to submit review right now')); setSubmitting(false); return }
      setSubmitted(true)
    } catch {
      setError(t('Unable to submit review right now'))
      setSubmitting(false)
    }
  }

  return (
    <div className="aliReviewForm">
      <span className="aliReviewFormLabel">{t('Your rating')}</span>
      <div className="aliReviewStarPicker" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" aria-label={t('{n} out of 5 stars', { n })} onMouseEnter={() => setHoverRating(n)} onClick={() => setRating(n)}>
            <Star size={22} fill="currentColor" opacity={n <= (hoverRating || rating) ? 1 : 0.22} />
          </button>
        ))}
      </div>
      <input className="aliReviewFormInput" type="text" placeholder={t('Review title (optional)')} maxLength={140} value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="aliReviewFormInput" placeholder={t('Share details about your experience (optional)')} maxLength={2000} rows={4} value={body} onChange={e => setBody(e.target.value)} />
      {error && <p className="aliReviewFormError">{error}</p>}
      <button type="button" className="focalButton primary" disabled={submitting} onClick={submit}>{submitting ? t('Submitting…') : t('Submit review')}</button>
    </div>
  )
}

export default function AliExpressProduct({ theme, product, related, variantAvailability, productAvailable, trackInventory, continueSellingWhenOutOfStock, reviewEligibility, sections = [], collections = [], vapidPublicKey, customerEmail, boughtTogether = [], flashSale = null, lbpRate = 0, storeWhatsapp = '', questionsEnabled = false, quantityDeals = [], lowStockThreshold = 0 }: { theme: AnyMap; product: AnyMap; related: AnyMap[]; boughtTogether?: Suggestion[]; variantAvailability: Array<{ name: string; sku: string; available: number }>; productAvailable: number; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; reviewEligibility: ReviewEligibility; sections?: AnyMap[]; collections?: AnyMap[]; vapidPublicKey?: string; customerEmail?: string; flashSale?: { percent: number; endsAt: string } | null; lbpRate?: number; storeWhatsapp?: string; questionsEnabled?: boolean; quantityDeals?: PublicDeal[]; lowStockThreshold?: number }) {
  const { t, lang, count: plural } = useI18n()
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
  // Ads: a product view (Meta/TikTok retargeting and catalog ads rely on it).
  const viewedProduct = useRef<string | null>(null)
  useEffect(() => {
    if (viewedProduct.current === String(product.id)) return
    viewedProduct.current = String(product.id)
    trackViewContent({ id: String(product.id), name: String(product.name || ''), price: Number(product.basePrice || 0) / 100 }, theme.currency || 'USD')
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const gallery = product.images?.length ? product.images : [{ url: '/placeholder-product.svg', alt: product.name }]
  const variants = product.variants || []
  const selectedVariant = variants.find((v: AnyMap) => v.id === selectedVariantId)
  const currentPrice = Number(selectedVariant?.price ?? product.basePrice ?? 0)
  // A flash sale (lib/flash-sale.ts) shows its price here; checkout takes it off the same way.
  const shownPrice = flashSale ? salePrice(currentPrice, flashSale.percent) : currentPrice
  const compareAt = flashSale ? Math.max(currentPrice, Number(selectedVariant?.compareAtPrice ?? product.compareAtPrice ?? 0)) : Number(selectedVariant?.compareAtPrice ?? product.compareAtPrice ?? 0)
  const discountPct = compareAt > shownPrice ? Math.round((1 - shownPrice / compareAt) * 100) : 0
  const activeImage = gallery[activeImgIndex]?.url || gallery[0]?.url || '/placeholder-product.svg'
  const wished = Boolean(wishlist[product.id])

  const selectedVariantIndex = variants.findIndex((v: AnyMap) => v.id === selectedVariantId)
  // Sold-out options stay selectable (so the shopper sees "Out of stock") but look crossed out.
  const optionSoldOut = (v: AnyMap) => trackInventory && !continueSellingWhenOutOfStock && (variantAvailability[variants.indexOf(v)]?.available ?? 1) <= 0
  const available = variants.length ? (variantAvailability[selectedVariantIndex]?.available ?? productAvailable) : productAvailable
  const canSell = !trackInventory || continueSellingWhenOutOfStock || available > 0
  // Pre-order (product setting): sold out but still for sale, with the expected delivery.
  const isPreorder = !!product.preorder && trackInventory && available <= 0
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
  const deliveryLabel = area?.eta ? t('Delivery to {area}: {eta}', { area: area.name, eta: area.eta }) : ''
  const lowLeft = canSell && !isPreorder ? lowStockLeft({ threshold: lowStockThreshold, available, trackInventory, continueSelling: continueSellingWhenOutOfStock }) : 0
  const stockLabel = !canSell ? t('Out of stock') : isPreorder ? t('Pre-order') : [lowLeft ? t('Only {n} left', { n: lowLeft }) : trackInventory && available > 0 ? t('{n} available', { n: available }) : t('In stock'), deliveryLabel].filter(Boolean).join(' · ')

  const buildItem = () => ({
    productId: product.id,
    variantId: selectedVariant?.id || null,
    // The chosen option is part of the line's name, so two sizes don't look identical in the cart.
    name: `${selectedVariant?.name ? `${product.name} — ${selectedVariant.name}` : product.name}${isPreorder ? ` (${t('Pre-order')})` : ''}`,
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

  // The page address for the WhatsApp message, known only in the browser (set after loading, so
  // the server and the browser render the same link first).
  const [pageOrigin, setPageOrigin] = useState('')
  useEffect(() => { setPageOrigin(window.location.origin) }, [])
  // "Order on WhatsApp": the product, option, quantity, price and link, ready to send the store.
  const whatsappText = [
    t('Hello! I would like to order:'),
    `${selectedVariant?.name ? `${product.name} (${selectedVariant.name})` : product.name} × ${qty}`,
    t('Price: {price}', { price: money(shownPrice, theme.currency || 'USD') }),
    `${pageOrigin}/product/${product.slug}`,
  ].join('\n')

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
  // Photos customers added to their reviews, newest reviews first (lib/review-photos.ts).
  const reviewPhotos: string[] = reviews.flatMap((r: AnyMap) => Array.isArray(r.photos) ? r.photos : []).slice(0, 12)
  const [viewPhoto, setViewPhoto] = useState('')
  const avgRating = Number(product.rating || 0)
  const canWriteReview = reviewEligibility !== 'already_reviewed' && reviewEligibility !== 'not_purchased'

  return (
    <main className="focalStorefront aliProductPage">
      {showBreadcrumbs && (
        <div className="aliContainer aliBreadcrumbs">
          <Link href="/">{t('Home')}</Link><ChevronRight size={12} className="flipRtl" />
          {primaryCollection && <><Link href={`/collections/${primaryCollection.slug}`}>{primaryCollection.name}</Link><ChevronRight size={12} className="flipRtl" /></>}
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
                <button key={im.id || i} type="button" className={activeImgIndex === i ? 'active' : ''} onClick={() => setActiveImgIndex(i)} aria-label={t('View image {n}', { n: i + 1 })}>
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
            {/* No reviews yet: no empty stars and "0 reviews", just the invitation to write one. */}
            {reviews.length > 0 && <span className="aliProductRating"><StarRow rating={avgRating} size={14} /> {avgRating > 0 && avgRating.toFixed(1)}</span>}
            {(reviews.length > 0 || canWriteReview) && <a href="#reviews" className="aliProductReviewsLink">{[reviews.length > 0 && plural(reviews.length, 'review'), canWriteReview && t('Write a review')].filter(Boolean).join(' · ')}</a>}
            {Number(product.soldCount || 0) > 0 && <span>{formatSold(Number(product.soldCount))}</span>}
          </div>
          <div className="aliProductPrice">
            <strong>{money(shownPrice, theme.currency || 'USD')}</strong>
            {compareAt > shownPrice && <del>{money(compareAt, theme.currency || 'USD')}</del>}
            {discountPct > 0 && <span className="aliProductDiscountPill">-{discountPct}%</span>}
          </div>
          {lbpRate > 0 && <LbpNote cents={shownPrice} rate={lbpRate} />}
          {flashSale && <FlashCountdown endsAt={flashSale.endsAt} />}
          <OccasionNote />
          <QuantityDealsBox deals={quantityDeals} />

          {variants.length > 0 && (
            <div className="aliProductVariants">
              <span>{t('Options')}</span>
              <div className="aliVariantList">
                {variants.map((v: AnyMap) => (
                  <button key={v.id} className={`${selectedVariantId === v.id ? 'selected' : ''} ${optionSoldOut(v) ? 'soldOut' : ''}`} aria-label={optionSoldOut(v) ? t('{name} (sold out)', { name: v.name }) : undefined} onClick={() => setSelectedVariantId(v.id)}>{v.name}</button>
                ))}
              </div>
            </div>
          )}

          {(showStockCounter || lowLeft > 0) && (
            <div className={`focalStock${lowLeft ? ' isLow' : ''}`}>
              <span className="focalStockDot" style={!canSell ? { background: 'var(--store-muted,#746b64)' } : lowLeft ? { background: '#d97706' } : undefined} /> {stockLabel}
            </div>
          )}

          {isPreorder && <div className="preorderNote"><CalendarClock size={18} aria-hidden="true" /><span>{product.preorderNote ? t('Pre-order: {note}', { note: product.preorderNote }) : t('Pre-order: we deliver it as soon as it arrives.')}</span></div>}

          {showQuantity && canSell && (
            <div className="aliQtyRow">
              <span>{t('Quantity')}</span>
              <div className="focalQty">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label={t('Decrease quantity')}><Minus size={14} /></button>
                <span>{qty}</span>
                <button onClick={() => setQty(Math.min(99, qty + 1))} aria-label={t('Increase quantity')}><Plus size={14} /></button>
              </div>
            </div>
          )}

          <div className="aliBuyRow">
            {canSell ? <>
              <button className="focalButton aliBuyNow" onClick={buyNow} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : t('This quantity is not available')}>{isPreorder ? t('Pre-order now') : t('Buy Now')}</button>
              <button className={`focalButton primary aliAddToCart ${added ? 'addedSuccess' : ''}`} onClick={addToCart} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : t('This quantity is not available')}>
                {added ? <>{t('Added')} <Check size={16} /></> : <>{t('Add to Cart')} <ShoppingBag size={16} /></>}
              </button>
            </> : (
              // Sold out (this option or the whole product): offer to tell the customer when it's back.
              <BackInStockButton productId={product.id} variantId={selectedVariant?.id || null} optionName={variants.length > 1 ? selectedVariant?.name : undefined} vapidPublicKey={vapidPublicKey} customerEmail={customerEmail} />
            )}
            {showWishlist && (
              <button type="button" className={`focalWishlist ${wished ? 'active' : ''}`} aria-label={wished ? t('Remove from wishlist') : t('Add to wishlist')} onClick={() => toggleWish(product.id)}>
                <Heart size={18} fill={wished ? 'currentColor' : 'none'} />
              </button>
            )}
            {showShare && (
              <button type="button" className="focalWishlist aliShareButton" aria-label={t('Share this product')} onClick={share}>
                {shared ? <Check size={18} /> : <Share2 size={17} />}
              </button>
            )}
          </div>

          {storeWhatsapp && canSell && <a className="waOrderBtn" href={`https://wa.me/${storeWhatsapp}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> {t('Order on WhatsApp')}</a>}

          {showTrustBadges && (
            <div className="focalTrustGrid">
              <span>✓ {t('Secure checkout')}</span>
              {product.returnsEnabled !== false && <span>✓ {t('Easy returns')}</span>}
              <FreeDeliveryBadge />
            </div>
          )}

          {/* Under the buy buttons, so the price and Add to cart stay near the top on a phone. */}
          {product.videoUrl && (
            <div className="aliProductVideo">
              <span>{t('Watch it in action')}</span>
              <video src={product.videoUrl} controls playsInline preload="metadata" aria-label={t('Product video')} />
            </div>
          )}

          <div className="focalAccordions">
            {showDescription && product.descriptionHtml && <details open><summary>{t('Description')}<ChevronDown size={16} /></summary><div className="pdpRichText" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} /></details>}
            <details><summary>{t('Product information')}<ChevronDown size={16} /></summary><p>{t('SKU')} {selectedVariant?.sku || product.sku || '—'}</p></details>
            {showShippingAccordion && (
              <details><summary>{t('Shipping & returns')}<ChevronDown size={16} /></summary><p>{merchantShippingText(pp.shippingText) || <ShippingNote />}</p></details>
            )}
            {showSpecs && product.metafields?.length > 0 && (
              <details><summary>{t('Specifications')}<ChevronDown size={16} /></summary>
                <table className="aliSpecTable">
                  <tbody>
                    {product.metafields.map((m: AnyMap) => (
                      <tr key={m.name}>
                        <th>{m.name}</th>
                        <td>
                          {m.type === 'boolean' ? (m.value === 'true' ? t('Yes') : t('No'))
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

      {canSell && boughtTogether.length > 0 && (
        <div className="aliContainer aliSection">
          <BoughtTogether key={selectedVariant?.id || product.id} main={{ ...buildItem(), quantity: 1 }} items={boughtTogether.slice(0, 2)} currency={theme.currency || 'USD'} />
        </div>
      )}

      {showReviews && (
        <div className="aliContainer aliReviewsSection" id="reviews">
          <h2>{t('Customer Reviews')} {reviews.length > 0 && <span className="aliReviewAvg"><StarRow rating={avgRating} size={16} /> {avgRating.toFixed(1)} ({reviews.length})</span>}</h2>
          {reviewEligibility === 'can_review' && <ReviewForm productId={product.id} />}
          {reviewEligibility === 'already_reviewed' && <p className="aliReviewFormNote">{t("You've already reviewed this product. Thanks for the feedback.")}</p>}
          {reviewEligibility === 'guest' && (() => {
            // Bring the customer straight back to this product's reviews after signing in.
            const back = encodeURIComponent(`/product/${product.slug}#reviews`)
            return <div className="aliReviewSignIn" role="note">
              <span className="aliReviewSignInIcon" aria-hidden="true"><MessageSquareText size={22} /></span>
              <div className="aliReviewSignInText">
                <strong>{t('Bought this product? Share your review')}</strong>
                <p>{t('Sign in to rate it and write a review. You can review it once your order is confirmed.')}</p>
              </div>
              <div className="aliReviewSignInActions">
                <Link className="aliReviewSignInBtn" href={`/account/login?next=${back}`}>{t('Sign in to review')}</Link>
                <Link className="aliReviewSignInAlt" href={`/account/register?next=${back}`}>{t('Create an account')}</Link>
              </div>
            </div>
          })()}
          {reviewEligibility === 'not_purchased' && <p className="aliReviewFormNote">{t('Only customers who bought this product can review it. You can write one once your order is confirmed.')}</p>}
          {reviewPhotos.length > 0 && <div className="aliCustomerPhotos">
            <h3>{t('Customer photos ({n})', { n: reviewPhotos.length })}</h3>
            <div className="aliReviewPhotos">{reviewPhotos.map(url => <button type="button" key={url} className="aliReviewPhotoBtn" onClick={() => setViewPhoto(url)} aria-label={t('See photo')}><img src={url} alt="" loading="lazy" width={76} height={76} /></button>)}</div>
          </div>}
          {reviews.length > 0 ? (
            <div className="aliReviewList">
              {reviews.map((r: AnyMap) => (
                <div className={`aliReviewItem${r.featured ? ' aliReviewFeatured' : ''}`} key={r.id}>
                  <div className="aliReviewHead">
                    <StarRow rating={Number(r.rating || 0)} size={13} />
                    <strong>{r.user?.name || t('Customer')}</strong>
                    {r.verified && <span className="aliReviewVerified"><BadgeCheck size={13} aria-hidden="true" /> {t('Verified purchase')}</span>}
                    {r.featured && <span className="aliReviewFeaturedBadge">{t('Featured')}</span>}
                    <span>{new Date(r.createdAt).toLocaleDateString(dateLocale(lang))}</span>
                  </div>
                  {r.title && <div className="aliReviewTitle">{r.title}</div>}
                  <p>{r.body}</p>
                  {Array.isArray(r.photos) && r.photos.length > 0 && <div className="aliReviewPhotos">
                    {r.photos.map((url: string) => <button type="button" key={url} className="aliReviewPhotoBtn" onClick={() => setViewPhoto(url)} aria-label={t('See photo')}><img src={url} alt="" loading="lazy" width={76} height={76} /></button>)}
                  </div>}
                </div>
              ))}
            </div>
          ) : reviewEligibility === 'not_purchased' || reviewEligibility === 'guest' ? null : (
            <p className="aliEmptyState">{t('No reviews yet.')}</p>
          )}
        </div>
      )}

      {questionsEnabled && <ProductQuestions productId={product.id} questions={Array.isArray(product.questions) ? product.questions : []} />}
      {canSell && <StickyBuyBar watch=".aliBuyRow" price={money(shownPrice, theme.currency || 'USD')} compareAt={compareAt > shownPrice ? money(compareAt, theme.currency || 'USD') : undefined} addLabel={t('Add to Cart')} addedLabel={t('Added')} added={added} disabled={!purchaseAllowed} onAdd={addToCart} />}
      {viewPhoto && <div className="photoViewer" role="dialog" aria-modal="true" aria-label={t('Customer photo')} onClick={() => setViewPhoto('')}>
        <img src={viewPhoto} alt="" />
        <button type="button" onClick={() => setViewPhoto('')} aria-label={t('Close')}><X size={22} /></button>
      </div>}

      {showRelated && related.length > 0 && (
        <div className="aliContainer aliSection">
          <div className="aliSectionHead"><h2>{t('You may also like')}</h2></div>
          <div className="aliDenseGrid">
            {related.slice(0, relatedLimit).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </div>
      )}

      <RecentlyViewedRow currentId={product.id} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />

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
    </main>
  )
}
