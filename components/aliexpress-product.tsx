'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronDown, Heart, Minus, Plus, ShoppingBag, Star } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { useWishlist } from '@/components/use-wishlist'
import { ProductCard, QuickView, StarRow, StoreImage, formatSold, img, money } from '@/components/storefront-sections'

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

export default function AliExpressProduct({ theme, product, related, variantAvailability, productAvailable, trackInventory, continueSellingWhenOutOfStock, reviewEligibility }: { theme: AnyMap; product: AnyMap; related: AnyMap[]; variantAvailability: Array<{ name: string; sku: string; available: number }>; productAvailable: number; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; reviewEligibility: ReviewEligibility }) {
  const { addItem } = useCart()
  const { wishlist, toggleWish } = useWishlist()
  const router = useRouter()
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(product.variants?.[0]?.id || null)
  const [qty, setQty] = useState(1)
  const [activeImgIndex, setActiveImgIndex] = useState(0)
  const [added, setAdded] = useState(false)
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)

  useEffect(() => { setSelectedVariantId(product.variants?.[0]?.id || null); setQty(1); setActiveImgIndex(0) }, [product.id])

  const gallery = product.images?.length ? product.images : [{ url: '/placeholder-product.svg', alt: product.name }]
  const variants = product.variants || []
  const selectedVariant = variants.find((v: AnyMap) => v.id === selectedVariantId)
  const currentPrice = Number(selectedVariant?.price ?? product.basePrice ?? 0)
  const compareAt = Number(selectedVariant?.compareAtPrice ?? product.compareAtPrice ?? 0)
  const discountPct = compareAt > currentPrice ? Math.round((1 - currentPrice / compareAt) * 100) : 0
  const activeImage = gallery[activeImgIndex]?.url || gallery[0]?.url || '/placeholder-product.svg'
  const wished = Boolean(wishlist[product.id])

  const selectedVariantIndex = variants.findIndex((v: AnyMap) => v.id === selectedVariantId)
  const available = variants.length ? (variantAvailability[selectedVariantIndex]?.available ?? productAvailable) : productAvailable
  const canSell = !trackInventory || continueSellingWhenOutOfStock || available > 0
  const purchaseAllowed = canSell && (!trackInventory || continueSellingWhenOutOfStock || qty <= available)
  const stockLabel = !trackInventory ? 'In stock · Ships within 24 hours' : canSell ? `${available} available · Ships within 24 hours` : 'Out of stock'

  const buildItem = () => ({
    productId: product.id,
    variantId: selectedVariant?.id || null,
    name: product.name,
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

  const reviews = product.reviews || []
  const avgRating = Number(product.rating || 0)

  return (
    <div className="focalStorefront aliProductPage">
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
                  <button key={v.id} className={selectedVariantId === v.id ? 'selected' : ''} onClick={() => setSelectedVariantId(v.id)}>{v.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="focalStock">
            <span className="focalStockDot" style={!canSell ? { background: 'var(--store-muted,#746b64)' } : undefined} /> {stockLabel}
          </div>

          <div className="aliQtyRow">
            <span>Quantity</span>
            <div className="focalQty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty(Math.min(99, qty + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
            </div>
          </div>

          <div className="aliBuyRow">
            <button className="focalButton aliBuyNow" onClick={buyNow} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : 'This quantity is not available'}>Buy Now</button>
            <button className={`focalButton primary aliAddToCart ${added ? 'addedSuccess' : ''}`} onClick={addToCart} disabled={!purchaseAllowed} title={purchaseAllowed ? undefined : 'This quantity is not available'}>
              {added ? <>Added <Check size={16} /></> : <>Add to Cart <ShoppingBag size={16} /></>}
            </button>
            <button type="button" className={`focalWishlist ${wished ? 'active' : ''}`} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWish(product.id)}>
              <Heart size={18} fill={wished ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="focalTrustGrid">
            <span>✓ Secure checkout</span>
            <span>✓ Easy returns</span>
            <span>✓ Free shipping &gt; $50</span>
          </div>

          <div className="focalAccordions">
            <details open><summary>Description<ChevronDown size={16} /></summary><p>{product.description || product.shortDescription || ''}</p></details>
            <details><summary>Product information<ChevronDown size={16} /></summary><p>SKU {selectedVariant?.sku || product.sku || '—'}{product.category?.name ? ` · ${product.category.name}` : ''}</p></details>
            {product.metafields?.length > 0 && (
              <details><summary>Specifications<ChevronDown size={16} /></summary>
                <table className="aliSpecTable">
                  <tbody>
                    {product.metafields.map((m: AnyMap) => (
                      <tr key={m.name}>
                        <th>{m.name}</th>
                        <td>{m.type === 'boolean' ? (m.value === 'true' ? 'Yes' : 'No') : m.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        </div>
      </div>

      <div className="aliContainer aliReviewsSection">
        <h2>Customer Reviews {reviews.length > 0 && <span className="aliReviewAvg"><StarRow rating={avgRating} size={16} /> {avgRating.toFixed(1)} ({reviews.length})</span>}</h2>
        {reviewEligibility === 'can_review' && <ReviewForm productId={product.id} />}
        {reviewEligibility === 'already_reviewed' && <p className="aliReviewFormNote">You've already reviewed this product — thanks for the feedback.</p>}
        {reviewEligibility === 'guest' && <p className="aliReviewFormNote"><Link href="/account/login">Sign in</Link> to write a review after your order is delivered.</p>}
        {reviews.length > 0 ? (
          <div className="aliReviewList">
            {reviews.map((r: AnyMap) => (
              <div className="aliReviewItem" key={r.id}>
                <div className="aliReviewHead">
                  <StarRow rating={Number(r.rating || 0)} size={13} />
                  <strong>{r.user?.name || 'Verified buyer'}</strong>
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

      {related.length > 0 && (
        <div className="aliContainer aliSection">
          <div className="aliSectionHead"><h2>You may also like</h2></div>
          <div className="aliDenseGrid">
            {related.slice(0, 12).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </div>
      )}

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </div>
  )
}
