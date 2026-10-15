'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'
import { Minus, Plus, ShieldCheck, ShoppingBag, Tag, Trash2, Truck } from 'lucide-react'
import { useCart, keyOf } from '@/components/cart-provider'
import { money } from '@/lib/config'
import StorefrontSections, { ProductCard, QuickView } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'
import { CartNotices } from '@/components/cart-notices'
import { NumInput } from './num-input'

type AnyMap = Record<string, any>

export default function AliExpressCart({ theme, recommended, sections = [], zoneCollections = [] }: { theme?: AnyMap; recommended?: AnyMap[]; sections?: AnyMap[]; zoneCollections?: AnyMap[] }) {
  const { t, count: plural } = useI18n()
  const { items, updateQty, removeItem, isSelected, toggleSelected, selectAll, deselectAll, selectedItems, selectedCount, selectedSubtotal } = useCart()
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [couponSaved, setCouponSaved] = useState(false)
  const cartSettings = theme?.cart || {}
  const showStickyCheckout = cartSettings.stickyCheckout !== false
  const showFreeShippingBar = cartSettings.freeShippingBar !== false
  const showRecommendations = cartSettings.recommendations !== false

  useEffect(() => {
    let active = true
    fetch('/api/store/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!active) return
        const threshold = Number(data?.settings?.checkout?.freeShippingThreshold)
        if (Number.isFinite(threshold) && threshold > 0) setFreeShippingThreshold(Math.round(threshold * 100))
      })
      .catch(() => {})
    try {
      const saved = localStorage.getItem('ecom-coupon-code')
      if (saved) setCouponCode(saved)
    } catch {}
    return () => { active = false }
  }, [])

  const allSelected = items.length > 0 && items.every(item => isSelected(keyOf(item)))
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)

  const saveCoupon = () => {
    try {
      if (couponCode.trim()) localStorage.setItem('ecom-coupon-code', couponCode.trim().toUpperCase())
      else localStorage.removeItem('ecom-coupon-code')
    } catch {}
    setCouponSaved(true)
    setTimeout(() => setCouponSaved(false), 1500)
  }

  const remainingForFreeShipping = freeShippingThreshold ? Math.max(0, freeShippingThreshold - selectedSubtotal) : 0

  if (!items.length) {
    return (
      <main className="cartPage focalStorefront aliCartPage">
        <div className="focalContainer">
          <section className="emptyCartUX" role="status">
            <div className="icon"><ShoppingBag size={26} /></div>
            <h1>{t('Nothing here yet.')}</h1>
            <p>{t('Browse the store, compare products, and add your favourites to start a fast checkout.')}</p>
            <Link className="focalButton primary" href="/shop">{t('Continue shopping')}</Link>
          </section>
          {showRecommendations && theme && recommended && recommended.length > 0 && (
            <div className="aliSection">
              <div className="aliSectionHead"><h2>{t('You might also like')}</h2></div>
              <div className="aliDenseGrid">
                {recommended.map(p => (
                  <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
                ))}
              </div>
            </div>
          )}
          {sections.length > 0 && theme && <StorefrontSections theme={theme} sections={sections} products={recommended || []} collections={zoneCollections} />}
        </div>
        {quickProduct && theme && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
      </main>
    )
  }

  return (
    <main className="cartPage focalStorefront aliCartPage">
      <div className="focalContainer">
        <header className="cartHeader">
          <div>
            <span className="focalEyebrow">{t('YOUR BAG')}</span>
            <h1>{t('Ready to checkout?')}</h1>
            <p>{t('{count} saved for checkout.', { count: plural(itemCount, 'item') })}</p>
          </div>
          <span className="pill" aria-label={t('{count} in cart', { count: plural(itemCount, 'item') })}>{plural(itemCount, 'item')}</span>
        </header>
        <CartNotices />

        {showFreeShippingBar && freeShippingThreshold !== null && (
          <div className="aliShippingBanner">
            <Truck size={16} />
            {remainingForFreeShipping > 0
              ? <span>{t('Add {amount} more to your selected items for free shipping', { amount: money(remainingForFreeShipping) })}</span>
              : <span>{t('Your selected items qualify for free shipping')}</span>}
          </div>
        )}

        <div className="cartLayout">
          <section className="cartItemsCard" aria-label={t('Shopping cart items')}>
            <div className="cartItemsHead">
              <label className="aliCartCheck">
                <input type="checkbox" checked={allSelected} onChange={() => allSelected ? deselectAll() : selectAll()} aria-label={t('Select all items')} />
                <span>{t('Select all')}</span>
              </label>
              <span>{t('{n} selected', { n: selectedCount })}</span>
            </div>

            {items.map(item => {
              const key = keyOf(item)
              const checked = isSelected(key)
              const lineTotal = item.price * item.quantity
              return (
                <article className={`cartRowUX aliCartRow ${checked ? '' : 'unselected'}`} key={key}>
                  <div className="aliCartRowMedia">
                    <input type="checkbox" className="aliCartRowCheck" checked={checked} onChange={() => toggleSelected(key)} aria-label={t('Select {name} for checkout', { name: item.name })} />
                    <img className="cartImageUX" src={item.image || '/placeholder-product.svg'} alt="" loading="lazy" decoding="async" width={116} height={116} />
                  </div>
                  <div className="cartInfoUX">
                    <div className="cartProductName" title={item.name}>{item.name}</div>
                    {item.sku && <span className="sku">{t('SKU {sku}', { sku: item.sku })}</span>}
                    {item.bundleId && <span className="cartBundleNote">{t('Part of a bundle: the bundle price is applied at checkout')}</span>}
                    <span className="unitPrice">{t('{price} each', { price: money(item.price) })}</span>
                    <span className="cartLineTotal">{money(lineTotal)}</span>
                  </div>
                  <div className="cartControlsUX">
                    <div className="qtyUX" aria-label={t('Quantity for {name}', { name: item.name })}>
                      <button type="button" onClick={() => updateQty(key, Math.max(1, item.quantity - 1))} aria-label={t('Decrease quantity')}><Minus size={15} /></button>
                      <NumInput aria-label={t('Quantity for {name}', { name: item.name })} value={item.quantity} onValue={n => updateQty(key, Math.max(1, Math.min(99, Number(n) || 1)))} />
                      <button type="button" onClick={() => updateQty(key, Math.min(99, item.quantity + 1))} aria-label={t('Increase quantity')}><Plus size={15} /></button>
                    </div>
                    <button className="removeUX" type="button" onClick={() => removeItem(key)} aria-label={t('Remove {name}', { name: item.name })}><Trash2 size={14} /> <span>{t('Remove')}</span></button>
                  </div>
                </article>
              )
            })}

            <div className="aliCouponRow">
              <Tag size={16} />
              <input type="text" placeholder={t('Enter coupon code')} value={couponCode} onChange={e => setCouponCode(e.target.value)} maxLength={40} />
              <button type="button" className="focalButton secondary" onClick={saveCoupon}>{couponSaved ? t('Saved') : t('Apply at checkout')}</button>
            </div>
          </section>

          <aside className="summaryUX" aria-label={t('Order summary')}>
            <h2>{t('Order summary')}</h2>
            <div className="summaryLineUX"><span>{t('Selected items ({count})', { count: selectedCount })}</span><strong>{money(selectedSubtotal)}</strong></div>
            <div className="summaryLineUX"><span>{t('Shipping')}</span><span>{t('Calculated at checkout')}</span></div>
            <div className="summaryTotalUX"><span>{t('Estimated total')}</span><strong>{money(selectedSubtotal)}</strong></div>
            <p className="summaryNoteUX">{t('Taxes, shipping, discounts and final total are calculated securely at checkout.')}</p>
            <div className="cartActionUX">
              <Link className={`focalButton primary wide aliCartCheckoutLink ${selectedItems.length ? '' : 'disabled'}`} href="/checkout" aria-disabled={!selectedItems.length} onClick={e => { if (!selectedItems.length) e.preventDefault() }}>
                {t('Checkout ({count})', { count: selectedCount })}
              </Link>
              <Link className="focalButton secondary wide" href="/shop">{t('Continue shopping')}</Link>
            </div>
            <div className="cartTrustUX">
              <div><ShieldCheck size={16} /><span><strong>{t('Secure checkout')}</strong><small>{t('Your order is protected.')}</small></span></div>
              <div><Truck size={16} /><span><strong>{t('Fast delivery')}</strong><small>{t('Shipping shown at checkout.')}</small></span></div>
            </div>
          </aside>
        </div>

        {showRecommendations && theme && recommended && recommended.length > 0 && (
          <div className="aliSection">
            <div className="aliSectionHead"><h2>{t('You might also like')}</h2></div>
            <div className="aliDenseGrid">
              {recommended.map(p => (
                <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
              ))}
            </div>
          </div>
        )}
        {/* Merchant-addable content -- see the matching comment in
            components/aliexpress-product.tsx for the pattern this follows.
            Placed above the sticky checkout bar/QuickView modal, which stay
            fixed-position overlays regardless of what's added here. */}
        {sections.length > 0 && theme && <StorefrontSections theme={theme} sections={sections} products={recommended || []} collections={zoneCollections} />}
      </div>

      {showStickyCheckout && (
        <div className="aliCartStickyBar">
          <div className="aliCartStickyInfo">
            <span>{plural(selectedCount, 'item')}</span>
            <strong>{money(selectedSubtotal)}</strong>
          </div>
          <Link className={`focalButton primary ${selectedItems.length ? '' : 'disabled'}`} href="/checkout" aria-disabled={!selectedItems.length} onClick={e => { if (!selectedItems.length) e.preventDefault() }}>
            {t('Checkout')}
          </Link>
        </div>
      )}

      {quickProduct && theme && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </main>
  )
}
