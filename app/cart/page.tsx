'use client'

import Link from 'next/link'
import { useCart, keyOf } from '@/components/cart-provider'
import { Footer } from '@/components/footer'
import { money } from '@/lib/config'

export default function Cart() {
  const { items, updateQty, removeItem, subtotal } = useCart()
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)

  return <>
    <main className="section">
      <div className="container">
        <div className="sectionHead">
          <div><span className="muted">YOUR BAG</span><h1 className="h2">Cart</h1></div>
          {items.length > 0 && <span className="pill" aria-label={`${itemCount} items in cart`}>{itemCount} items</span>}
        </div>

        {!items.length ? <div className="card empty" role="status">
          <h3>Your cart is empty.</h3>
          <p className="muted">Discover products and add them here for a fast checkout.</p>
          <Link className="btn" href="/shop">Continue shopping</Link>
        </div> : <div className="split">
          <div className="grid" style={{ gap: 10 }}>
            {items.map(item => {
              const key = keyOf(item)
              return <div className="card cartRow" key={key}>
                <img src={item.image || '/placeholder-product.svg'} alt="" loading="lazy" />
                <div className="cartInfo">
                  <strong title={item.name}>{item.name}</strong>
                  {item.sku && <span className="muted">{item.sku}</span>}
                  <span className="price">{money(item.price)}</span>
                </div>
                <div className="cartControls">
                  <label className="srOnly" htmlFor={`quantity-${key}`}>Quantity for {item.name}</label>
                  <input id={`quantity-${key}`} aria-label={`Quantity for ${item.name}`} className="input" type="number" min="1" max="99" value={item.quantity} onChange={e => updateQty(key, Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
                  <button className="textButton" type="button" onClick={() => removeItem(key)} aria-label={`Remove ${item.name} from cart`}>Remove</button>
                </div>
              </div>
            })}
          </div>

          <aside className="card summaryCard" aria-label="Order summary">
            <span className="muted">SUMMARY</span>
            <div className="summaryLine"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="summaryLine"><span>Shipping</span><span>Calculated at checkout</span></div>
            <div className="summaryLine total"><span>Estimated subtotal</span><strong>{money(subtotal)}</strong></div>
            <p className="muted" style={{ marginTop: 8 }}>Taxes, shipping and any eligible discounts are calculated securely at checkout.</p>
            <Link className="btn" href="/checkout">Checkout</Link>
            <Link className="btn secondary" href="/shop">Continue shopping</Link>
          </aside>
        </div>}
      </div>
    </main>
    <Footer />
  </>
}
