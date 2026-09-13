'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, ShieldCheck, ShoppingBag, Tag, Trash2, Truck } from 'lucide-react'
import { useCart, keyOf } from '@/components/cart-provider'
import { money } from '@/lib/config'

export default function AliExpressCart() {
  const { items, updateQty, removeItem, isSelected, toggleSelected, selectAll, deselectAll, selectedItems, selectedCount, selectedSubtotal } = useCart()
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [couponSaved, setCouponSaved] = useState(false)

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
            <h2>Nothing here yet.</h2>
            <p>Browse the store, compare products, and add your favourites to start a fast checkout.</p>
            <Link className="focalButton primary" href="/shop">Continue shopping</Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="cartPage focalStorefront aliCartPage">
      <div className="focalContainer">
        <header className="cartHeader">
          <div>
            <span className="focalEyebrow">YOUR BAG</span>
            <h1>Ready to checkout?</h1>
            <p>{itemCount} {itemCount === 1 ? 'item' : 'items'} saved for checkout.</p>
          </div>
          <span className="pill" aria-label={`${itemCount} items in cart`}>{itemCount} items</span>
        </header>

        {freeShippingThreshold !== null && (
          <div className="aliShippingBanner">
            <Truck size={16} />
            {remainingForFreeShipping > 0
              ? <span>Add <strong>{money(remainingForFreeShipping)}</strong> more to your selected items for free shipping</span>
              : <span>Your selected items qualify for <strong>free shipping</strong></span>}
          </div>
        )}

        <div className="cartLayout">
          <section className="cartItemsCard" aria-label="Shopping cart items">
            <div className="cartItemsHead">
              <label className="aliCartCheck">
                <input type="checkbox" checked={allSelected} onChange={() => allSelected ? deselectAll() : selectAll()} aria-label="Select all items" />
                <span>Select all</span>
              </label>
              <span>{selectedCount} selected</span>
            </div>

            {items.map(item => {
              const key = keyOf(item)
              const checked = isSelected(key)
              const lineTotal = item.price * item.quantity
              return (
                <article className={`cartRowUX aliCartRow ${checked ? '' : 'unselected'}`} key={key}>
                  <div className="aliCartRowMedia">
                    <input type="checkbox" className="aliCartRowCheck" checked={checked} onChange={() => toggleSelected(key)} aria-label={`Select ${item.name} for checkout`} />
                    <img className="cartImageUX" src={item.image || '/placeholder-product.svg'} alt="" loading="lazy" decoding="async" width={116} height={116} />
                  </div>
                  <div className="cartInfoUX">
                    <div className="cartProductName" title={item.name}>{item.name}</div>
                    {item.sku && <span className="sku">SKU {item.sku}</span>}
                    <span className="unitPrice">{money(item.price)} each</span>
                    <span className="cartLineTotal">{money(lineTotal)}</span>
                  </div>
                  <div className="cartControlsUX">
                    <div className="qtyUX" aria-label={`Quantity for ${item.name}`}>
                      <button type="button" onClick={() => updateQty(key, Math.max(1, item.quantity - 1))} aria-label={`Decrease ${item.name} quantity`}><Minus size={15} /></button>
                      <input aria-label={`Quantity for ${item.name}`} type="number" min="1" max="99" value={item.quantity} onChange={e => updateQty(key, Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
                      <button type="button" onClick={() => updateQty(key, Math.min(99, item.quantity + 1))} aria-label={`Increase ${item.name} quantity`}><Plus size={15} /></button>
                    </div>
                    <button className="removeUX" type="button" onClick={() => removeItem(key)} aria-label={`Remove ${item.name} from cart`}><Trash2 size={14} /> <span>Remove</span></button>
                  </div>
                </article>
              )
            })}

            <div className="aliCouponRow">
              <Tag size={16} />
              <input type="text" placeholder="Enter coupon code" value={couponCode} onChange={e => setCouponCode(e.target.value)} maxLength={40} />
              <button type="button" className="focalButton secondary" onClick={saveCoupon}>{couponSaved ? 'Saved' : 'Apply at checkout'}</button>
            </div>
          </section>

          <aside className="summaryUX" aria-label="Order summary">
            <h2>Order summary</h2>
            <div className="summaryLineUX"><span>Selected items ({selectedCount})</span><strong>{money(selectedSubtotal)}</strong></div>
            <div className="summaryLineUX"><span>Shipping</span><span>Calculated at checkout</span></div>
            <div className="summaryTotalUX"><span>Estimated total</span><strong>{money(selectedSubtotal)}</strong></div>
            <p className="summaryNoteUX">Taxes, shipping, discounts and final total are calculated securely at checkout.</p>
            <div className="cartActionUX">
              <Link className={`focalButton primary wide aliCartCheckoutLink ${selectedItems.length ? '' : 'disabled'}`} href="/checkout" aria-disabled={!selectedItems.length} onClick={e => { if (!selectedItems.length) e.preventDefault() }}>
                Checkout ({selectedCount})
              </Link>
              <Link className="focalButton secondary wide" href="/shop">Continue shopping</Link>
            </div>
            <div className="cartTrustUX">
              <div><ShieldCheck size={16} /><span><strong>Secure checkout</strong><small>Your order is protected.</small></span></div>
              <div><Truck size={16} /><span><strong>Fast delivery</strong><small>Shipping shown at checkout.</small></span></div>
            </div>
          </aside>
        </div>
      </div>

      <div className="aliCartStickyBar">
        <div className="aliCartStickyInfo">
          <span>{selectedCount} item{selectedCount === 1 ? '' : 's'}</span>
          <strong>{money(selectedSubtotal)}</strong>
        </div>
        <Link className={`focalButton primary ${selectedItems.length ? '' : 'disabled'}`} href="/checkout" aria-disabled={!selectedItems.length} onClick={e => { if (!selectedItems.length) e.preventDefault() }}>
          Checkout
        </Link>
      </div>
    </main>
  )
}
