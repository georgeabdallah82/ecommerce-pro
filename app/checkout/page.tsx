'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/cart-provider'
import { money } from '@/lib/config'

type PaymentDetails = {
  bank: { bankName:string; accountName:string; iban:string; instructions:string } | null
  wallet: { provider:string; accountName:string; accountNumber:string; instructions:string } | null
}
type StoreSettings = { payment: { cod:boolean; card:boolean; bank:boolean; wallet:boolean; details:PaymentDetails }; checkout:{ guestCheckout:boolean } }
type ClientCheckout = { type:'mpgs'; merchantId:string; sessionId:string; scriptUrl:string }
const defaultSettings:StoreSettings={payment:{cod:true,card:false,bank:false,wallet:false,details:{bank:null,wallet:null}},checkout:{guestCheckout:true}}

declare global { interface Window { Checkout?: { configure: (options: unknown) => void; showPaymentPage: () => void } } }

export default function Checkout() {
  const { selectedItems: items, selectedSubtotal: subtotal, clearSelected } = useCart()
  const router = useRouter()
  const [savedCoupon, setSavedCoupon] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ecom-coupon-code')
      if (saved) setSavedCoupon(saved)
    } catch {}
  }, [])
  const idempotencyKey = useRef(crypto.randomUUID())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<StoreSettings|null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [clientCheckout, setClientCheckout] = useState<ClientCheckout|null>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletCurrency, setWalletCurrency] = useState('USD')
  const [coinBalance, setCoinBalance] = useState(0)
  const [coinsToUse, setCoinsToUse] = useState(0)

  useEffect(()=>{
    let active=true
    Promise.all([
      fetch('/api/store/settings',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to load checkout settings');return data.settings||defaultSettings}),
      fetch('/api/auth/session',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({authenticated:false}));return Boolean(response.ok&&data.authenticated)}),
      fetch('/api/account/wallet',{cache:'no-store'}).then(async response=>{if(!response.ok)return null;return response.json().catch(()=>null)}),
      fetch('/api/account/coins',{cache:'no-store'}).then(async response=>{if(!response.ok)return null;return response.json().catch(()=>null)}),
    ]).then(([storeSettings,isAuthenticated,wallet,coins])=>{if(active){setSettings(storeSettings);setAuthenticated(isAuthenticated);setSessionLoaded(true);if(isAuthenticated&&wallet){setWalletBalance(Math.max(0,Number(wallet.balance||0)));setWalletCurrency(wallet.currency||'USD')}else{setWalletBalance(0)}if(isAuthenticated&&coins){setCoinBalance(Math.max(0,Number(coins.balance||0)))}else{setCoinBalance(0)}}}).catch(e=>{if(active){setSettings(defaultSettings);setAuthenticated(false);setSessionLoaded(true);setWalletBalance(0);setCoinBalance(0);setSettingsError(e instanceof Error?e.message:'Unable to load checkout settings')}})
    return ()=>{active=false}
  },[])

  useEffect(()=>{
    if(!clientCheckout) return
    const launch=()=>{
      if(!window.Checkout) return
      window.Checkout.configure({ merchant: clientCheckout.merchantId, session: { id: clientCheckout.sessionId } })
      window.Checkout.showPaymentPage()
    }
    if(window.Checkout){launch();return}
    const script=document.createElement('script');script.src=clientCheckout.scriptUrl;script.async=true;script.onload=launch;script.onerror=()=>setError('Unable to load the secure payment page. Please try again.');document.body.appendChild(script)
    return ()=>{script.onload=null}
  },[clientCheckout])

  const enabledMethods = settings ? [
    settings.payment.cod && ['COD','Cash on delivery'], settings.payment.card && ['CARD','Card'], settings.payment.bank && ['BANK_TRANSFER','Bank transfer'], settings.payment.wallet && authenticated && ['WALLET',`Wallet · ${money(walletBalance,walletCurrency)} available`],
  ].filter(Boolean) as [string,string][] : []
  const guestBlocked = Boolean(settings && sessionLoaded && !authenticated && settings.checkout.guestCheckout===false)
  const enabledMethodSignature = enabledMethods.map(([value])=>value).join('|')
  useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethodSignature,paymentMethod])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!items.length) { setError('Your cart is empty.'); return }
    if (!settings) { setError('Checkout settings are still loading. Please try again in a moment.'); return }
    if (!sessionLoaded) { setError('Authentication status is still loading. Please try again in a moment.'); return }
    if (guestBlocked) { setError('Guest checkout is disabled. Please sign in to continue.'); return }
    if (!enabledMethods.some(([value])=>value===paymentMethod)) { setError('Please choose an available payment method.'); return }
    if (coinsToUse > coinBalance) { setError('You do not have enough coins for this redemption.'); return }
    setLoading(true)
    const form = event.currentTarget; const fd = new FormData(form)
    const data = { email: String(fd.get('email') || ''), phone: String(fd.get('phone') || ''), paymentMethod, couponCode: String(fd.get('couponCode') || ''), coinsToUse, shippingAddress: { firstName: String(fd.get('firstName') || ''), lastName: String(fd.get('lastName') || ''), line1: String(fd.get('line1') || ''), line2: String(fd.get('line2') || ''), city: String(fd.get('city') || ''), region: String(fd.get('region') || ''), postalCode: String(fd.get('postalCode') || ''), country: String(fd.get('country') || ''), phone: String(fd.get('phone') || '') }, items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity })) }
    try {
      const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':idempotencyKey.current},body:JSON.stringify(data)})
      const output=await response.json(); if(!response.ok)throw new Error(output.error||'Unable to place order')
      clearSelected()
      try { localStorage.removeItem('ecom-coupon-code') } catch {}
      if(output.payment?.type==='mpgs'){setClientCheckout(output.payment as ClientCheckout);setLoading(false);return}
      const successUrl = authenticated ? `/order/success?order=${encodeURIComponent(output.order.orderNumber)}` : `/order/success?order=${encodeURIComponent(output.order.orderNumber)}&email=${encodeURIComponent(data.email)}`
      router.push(successUrl)
    } catch(e){setError(e instanceof Error?e.message:'Unable to place order');setLoading(false)}
  }

  const bankDetails = settings?.payment.details.bank
  const showBankDetails = paymentMethod==='BANK_TRANSFER' && bankDetails

  if(clientCheckout) return <main className="section"><div className="container narrow"><div className="card" style={{textAlign:'center'}}><span className="muted">SECURE PAYMENT</span><h1 className="h2">Continue to secure card payment</h1><p className="muted">Your payment details are entered directly on the payment provider's secure page.</p><div className="alert">Loading secure payment…</div><Link className="textLink" href="/cart">Return to cart</Link></div></div></main>

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
    {paymentMethod==='WALLET' && authenticated && <div className={walletBalance>0?'alert':'alert danger'}><strong>Store wallet</strong><div>{money(walletBalance,walletCurrency)} available for this order.</div></div>}
    {authenticated && coinBalance>0 && <div className="card" style={{padding:16,marginTop:12}}><strong>Use loyalty coins</strong><p className="muted" style={{marginTop:4}}>1 coin = 0.01 in store currency.</p><div className="inline" style={{marginTop:10,gap:10}}><input className="input" type="number" min="0" max={coinBalance} step="1" inputMode="numeric" value={coinsToUse||''} onChange={e=>setCoinsToUse(Math.max(0,Math.min(coinBalance,Number(e.target.value)||0)))} placeholder="Coins to use" /><button className="btn secondary" type="button" onClick={()=>setCoinsToUse(coinBalance)}>Use all</button></div>{coinsToUse>0&&<div className="muted" style={{marginTop:8}}>Discount: {money(coinsToUse)}</div>}</div>}
    {showBankDetails && <div className="alert"><strong>Bank transfer details</strong><div>Bank: {bankDetails.bankName || '—'}</div><div>Account name: {bankDetails.accountName || '—'}</div><div>IBAN: {bankDetails.iban || '—'}</div>{bankDetails.instructions && <div>{bankDetails.instructions}</div>}</div>}
    <label className="fieldLabel">Coupon <span className="muted">(optional)</span><input className="input" name="couponCode" autoCapitalize="characters" placeholder="Coupon code" defaultValue={savedCoupon} key={savedCoupon} /></label>
    {error&&<div className="alert danger" role="alert" aria-live="polite">{error}</div>}
    <button className="btn" type="submit" disabled={loading||!items.length||!settings||!sessionLoaded||enabledMethods.length===0||guestBlocked} aria-busy={loading}>{loading?'Placing order…':'Place order'}</button><Link className="textLink" href="/cart">Back to cart</Link>
  </form><aside className="card summaryCard"><span className="muted">ORDER SUMMARY</span>{items.map(item=><div className="summaryLine" key={item.productId+String(item.variantId)}><span>{item.name} × {item.quantity}</span><strong>{money(item.price*item.quantity)}</strong></div>)}<div className="summaryLine total"><span>Total before shipping</span><strong>{money(subtotal)}</strong></div><p className="muted">Shipping and tax are calculated securely at checkout from your delivery area and store rules.</p></aside></div></main>
}
