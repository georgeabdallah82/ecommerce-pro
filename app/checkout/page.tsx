'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/cart-provider'
import { money } from '@/lib/config'

type StoreSettings = { payment: { cod:boolean; card:boolean; bank:boolean; wallet:boolean }; checkout:{ guestCheckout:boolean } }
const defaultSettings:StoreSettings={payment:{cod:true,card:false,bank:false,wallet:false},checkout:{guestCheckout:true}}

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const router = useRouter()
  const idempotencyKey = useRef(crypto.randomUUID())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<StoreSettings|null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('COD')

  useEffect(()=>{
    let active=true
    Promise.all([
      fetch('/api/store/settings',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to load checkout settings');return data.settings||defaultSettings}),
      fetch('/api/auth/session',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({authenticated:false}));return Boolean(response.ok&&data.authenticated)}),
    ]).then(([storeSettings,isAuthenticated])=>{if(active){setSettings(storeSettings);setAuthenticated(isAuthenticated);setSessionLoaded(true)}}).catch(e=>{if(active){setSettings(defaultSettings);setAuthenticated(false);setSessionLoaded(true);setSettingsError(e instanceof Error?e.message:'Unable to load checkout settings')}})
    return ()=>{active=false}
  },[])

  const enabledMethods = settings ? [
    settings.payment.cod && ['COD','Cash on delivery'],
    settings.payment.card && ['CARD','Card'],
    settings.payment.bank && ['BANK_TRANSFER','Bank transfer'],
    settings.payment.wallet && ['WALLET','Wallet'],
  ].filter(Boolean) as [string,string][] : []
  const guestBlocked = Boolean(settings && sessionLoaded && !authenticated && settings.checkout.guestCheckout===false)

  useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethods.length,paymentMethod])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!items.length) { setError('Your cart is empty.'); return }
    if (!settings) { setError('Checkout settings are still loading. Please try again in a moment.'); return }
    if (!sessionLoaded) { setError('Authentication status is still loading. Please try again in a moment.'); return }
    if (guestBlocked) { setError('Guest checkout is disabled. Please sign in to continue.'); return }
    if (!enabledMethods.some(([value])=>value===paymentMethod)) { setError('Please choose an available payment method.'); return }
    setLoading(true)
    const form = event.currentTarget; const fd = new FormData(form)
    const data = { email: String(fd.get('email') || ''), phone: String(fd.get('phone') || ''), paymentMethod, couponCode: String(fd.get('couponCode') || ''), shippingAddress: { firstName: String(fd.get('firstName') || ''), lastName: String(fd.get('lastName') || ''), line1: String(fd.get('line1') || ''), line2: String(fd.get('line2') || ''), city: String(fd.get('city') || ''), region: String(fd.get('region') || ''), postalCode: String(fd.get('postalCode') || ''), country: String(fd.get('country') || ''), phone: String(fd.get('phone') || '') }, items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity })) }
    try { const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':idempotencyKey.current},body:JSON.stringify(data)});const output=await response.json();if(!response.ok)throw new Error(output.error||'Unable to place order');clear();router.push(`/order/success?order=${encodeURIComponent(output.order.orderNumber)}`) }
    catch(e){setError(e instanceof Error?e.message:'Unable to place order')} finally{setLoading(false)}
  }

  return <main className="section"><div className="container split"><form className="card checkoutForm" onSubmit={submit}>
    <span className="muted">CHECKOUT</span><h1 className="h2">Secure, simple, fast.</h1>
    {!settings && <div className="alert">Loading checkout settings…</div>}
    {guestBlocked && <div className="alert danger">Guest checkout is disabled. <Link className="textLink" href="/account/login">Sign in</Link> to continue.</div>}
    {settingsError && <div className="alert danger">{settingsError}</div>}
    <h3>Contact</h3><label className="fieldLabel">Email<input className="input" required name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" /></label><label className="fieldLabel">Phone<input className="input" name="phone" autoComplete="tel" inputMode="tel" placeholder="Phone" /></label>
    <h3>Delivery</h3><div className="grid two"><label className="fieldLabel">First name<input className="input" required name="firstName" autoComplete="given-name" placeholder="First name" /></label><label className="fieldLabel">Last name<input className="input" required name="lastName" autoComplete="family-name" placeholder="Last name" /></label></div>
    <label className="fieldLabel">Address<input className="input" required name="line1" autoComplete="address-line1" placeholder="Street address" /></label><label className="fieldLabel">Apartment, floor, etc. <span className="muted">(optional)</span><input className="input" name="line2" autoComplete="address-line2" placeholder="Apartment, floor, etc." /></label>
    <div className="grid two"><label className="fieldLabel">City<input className="input" required name="city" autoComplete="address-level2" placeholder="City" /></label><label className="fieldLabel">Region<input className="input" name="region" autoComplete="address-level1" placeholder="Region" /></label></div><div className="grid two"><label className="fieldLabel">Postal code<input className="input" name="postalCode" autoComplete="postal-code" inputMode="numeric" placeholder="Postal code" /></label><label className="fieldLabel">Country<input className="input" required name="country" autoComplete="country-name" placeholder="Country" defaultValue="Lebanon" /></label></div>
    <h3>Payment</h3>{settings&&enabledMethods.length>0?<label className="fieldLabel">Payment method<select className="input" name="paymentMethod" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>{enabledMethods.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>:settings?<div className="alert danger">No payment methods are currently enabled. Please contact the store.</div>:null}
    <label className="fieldLabel">Coupon <span className="muted">(optional)</span><input className="input" name="couponCode" autoCapitalize="characters" placeholder="Coupon code" /></label>
    {error&&<div className="alert danger" role="alert" aria-live="polite">{error}</div>}
    <button className="btn" type="submit" disabled={loading||!items.length||!settings||!sessionLoaded||enabledMethods.length===0||guestBlocked} aria-busy={loading}>{loading?'Placing order…':'Place order'}</button><Link className="textLink" href="/cart">Back to cart</Link>
  </form><aside className="card summaryCard"><span className="muted">ORDER SUMMARY</span>{items.map(item=><div className="summaryLine" key={item.productId+String(item.variantId)}><span>{item.name} × {item.quantity}</span><strong>{money(item.price*item.quantity)}</strong></div>)}<div className="summaryLine total"><span>Total before shipping</span><strong>{money(subtotal)}</strong></div><p className="muted">Shipping and tax are calculated securely at checkout from your delivery area and store rules.</p></aside></div></main>
}
