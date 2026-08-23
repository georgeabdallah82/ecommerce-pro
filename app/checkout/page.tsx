'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/cart-provider'
import { money } from '@/lib/config'

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const router = useRouter()
  const idempotencyKey = useRef(crypto.randomUUID())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!items.length) { setError('Your cart is empty.'); return }
    setLoading(true)
    const form = event.currentTarget
    const fd = new FormData(form)
    const paymentMethod = String(fd.get('paymentMethod') || 'COD')
    const data = {
      email: String(fd.get('email') || ''), phone: String(fd.get('phone') || ''), paymentMethod,
      couponCode: String(fd.get('couponCode') || ''),
      shippingAddress: {
        firstName: String(fd.get('firstName') || ''), lastName: String(fd.get('lastName') || ''), line1: String(fd.get('line1') || ''), line2: String(fd.get('line2') || ''),
        city: String(fd.get('city') || ''), region: String(fd.get('region') || ''), postalCode: String(fd.get('postalCode') || ''), country: String(fd.get('country') || ''), phone: String(fd.get('phone') || ''),
      },
      items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity })),
    }

    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey.current }, body: JSON.stringify(data) })
      const output = await response.json()
      if (!response.ok) throw new Error(output.error || 'Unable to place order')
      clear()
      router.push(`/order/success?order=${encodeURIComponent(output.order.orderNumber)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to place order')
    } finally { setLoading(false) }
  }

  return <main className="section"><div className="container split">
    <form className="card checkoutForm" onSubmit={submit} noValidate>
      <span className="muted">CHECKOUT</span><h1 className="h2">Secure, simple, fast.</h1>
      <h3>Contact</h3>
      <label className="fieldLabel">Email<input className="input" required name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" /></label>
      <label className="fieldLabel">Phone<input className="input" name="phone" autoComplete="tel" inputMode="tel" placeholder="Phone" /></label>
      <h3>Delivery</h3>
      <div className="grid two"><label className="fieldLabel">First name<input className="input" required name="firstName" autoComplete="given-name" placeholder="First name" /></label><label className="fieldLabel">Last name<input className="input" required name="lastName" autoComplete="family-name" placeholder="Last name" /></label></div>
      <label className="fieldLabel">Address<input className="input" required name="line1" autoComplete="address-line1" placeholder="Street address" /></label>
      <label className="fieldLabel">Apartment, floor, etc. <span className="muted">(optional)</span><input className="input" name="line2" autoComplete="address-line2" placeholder="Apartment, floor, etc." /></label>
      <div className="grid two"><label className="fieldLabel">City<input className="input" required name="city" autoComplete="address-level2" placeholder="City" /></label><label className="fieldLabel">Region<input className="input" name="region" autoComplete="address-level1" placeholder="Region" /></label></div>
      <div className="grid two"><label className="fieldLabel">Postal code<input className="input" name="postalCode" autoComplete="postal-code" inputMode="numeric" placeholder="Postal code" /></label><label className="fieldLabel">Country<input className="input" required name="country" autoComplete="country-name" placeholder="Country" defaultValue="Lebanon" /></label></div>
      <h3>Payment</h3>
      <label className="fieldLabel">Payment method<select className="input" name="paymentMethod" defaultValue="COD"><option value="COD">Cash on delivery</option><option value="CARD" disabled>Card (gateway not configured)</option><option value="BANK_TRANSFER">Bank transfer</option><option value="WALLET">Wallet</option></select></label>
      <label className="fieldLabel">Coupon <span className="muted">(optional)</span><input className="input" name="couponCode" autoCapitalize="characters" placeholder="Coupon code" /></label>
      {error && <div className="alert danger" role="alert" aria-live="polite">{error}</div>}
      <button className="btn" type="submit" disabled={loading || !items.length} aria-busy={loading}>{loading ? 'Placing order…' : 'Place order'}</button>
      <Link className="textLink" href="/cart">Back to cart</Link>
    </form>
    <aside className="card summaryCard"><span className="muted">ORDER SUMMARY</span>{items.map(item => <div className="summaryLine" key={item.productId + String(item.variantId)}><span>{item.name} × {item.quantity}</span><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="summaryLine total"><span>Total before shipping</span><strong>{money(subtotal)}</strong></div><p className="muted">Shipping and tax are calculated securely at checkout from your delivery area and store rules.</p></aside>
  </div></main>
}
