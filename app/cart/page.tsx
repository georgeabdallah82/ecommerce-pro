'use client'

import Link from 'next/link'
import { Minus, Plus, ShoppingBag, ShieldCheck, Truck, RotateCcw, Trash2 } from 'lucide-react'
import { useCart, keyOf } from '@/components/cart-provider'
import { Footer } from '@/components/footer'
import { money } from '@/lib/config'

export default function Cart() {
  const { items, updateQty, removeItem, subtotal } = useCart()
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)

  return <>
    <main className="cartPage">
      <div className="focalContainer">
        <header className="cartHeader">
          <div>
            <span className="focalEyebrow">YOUR BAG</span>
            <h1>{items.length ? 'Ready to checkout?' : 'Your cart is empty'}</h1>
            <p>{items.length ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} saved for checkout.` : 'Add something you love and we’ll keep it here.'}</p>
          </div>
          {items.length > 0 && <span className="pill" aria-label={`${itemCount} items in cart`}>{itemCount} items</span>}
        </header>

        {!items.length ? <section className="emptyCartUX" role="status">
          <div className="icon"><ShoppingBag size={26} /></div>
          <h2>Nothing here yet.</h2>
          <p>Browse the store, compare products, and add your favourites to start a fast checkout.</p>
          <Link className="focalButton primary" href="/shop">Continue shopping</Link>
        </section> : <div className="cartLayout">
          <section className="cartItemsCard" aria-label="Shopping cart items">
            <div className="cartItemsHead"><span>Items</span><span>{itemCount} total</span></div>
            {items.map(item => {
              const key = keyOf(item)
              const lineTotal = item.price * item.quantity
              return <article className="cartRowUX" key={key}>
                <img className="cartImageUX" src={item.image || '/placeholder-product.svg'} alt="" loading="lazy" decoding="async" />
                <div className="cartInfoUX">
                  <a href="#" onClick={e => e.preventDefault()} aria-label={item.name}>{item.name}</a>
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
                  <button className="removeUX" type="button" onClick={() => removeItem(key)} aria-label={`Remove ${item.name} from cart`}><Trash2 size={14} /> Remove</button>
                </div>
              </article>
            })}
          </section>

          <aside className="summaryUX" aria-label="Order summary">
            <h2>Order summary</h2>
            <div className="summaryLineUX"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="summaryLineUX"><span>Shipping</span><span>Calculated at checkout</span></div>
            <div className="summaryTotalUX"><span>Estimated total</span><strong>{money(subtotal)}</strong></div>
            <p className="summaryNoteUX">Taxes, shipping, discounts and final total are calculated securely at checkout.</p>
            <div className="cartActionUX">
              <Link className="focalButton primary wide" href="/checkout">Proceed to checkout</Link>
              <Link className="focalButton secondary wide" href="/shop">Continue shopping</Link>
            </div>
            <div className="cartTrustUX">
              <div><ShieldCheck size={16} /><span><strong>Secure checkout</strong><small>Your order is protected.</small></span></div>
              <div><Truck size={16} /><span><strong>Fast delivery</strong><small>Shipping shown at checkout.</small></span></div>
              <div><RotateCcw size={16} /><span><strong>Easy returns</strong><small>Subject to store policy.</small></span></div>
            </div>
          </aside>
        </div>}
      </div>
    </main>
    <Footer />
  </>
}
