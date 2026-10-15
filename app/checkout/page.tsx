'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readDeliveryArea } from '@/components/market-chrome'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/components/cart-provider'
import { config, money } from '@/lib/config'
import { trackInitiateCheckout } from '@/lib/tracking-events'
import { CartNotices } from '@/components/cart-notices'
import { useI18n } from '@/components/lang-provider'

// "Lebanon" in English or Arabic. Written as escapes so the server bundle stays Latin-only
// (see scripts/check-worker-charset.mjs).
const LEBANON = new RegExp('^(lebanon|lb|\\u0644\\u0628\\u0646\\u0627\\u0646)$', 'i')

type PaymentDetails = {
  bank: { bankName:string; accountName:string; iban:string; instructions:string } | null
  wallet: { provider:string; accountName:string; accountNumber:string; instructions:string } | null
}
type StoreSettings = { payment: { cod:boolean; card:boolean; bank:boolean; wallet:boolean; details:PaymentDetails }; checkout:{ guestCheckout:boolean } }
type ClientCheckout = { type:'mpgs'; merchantId:string; sessionId:string; scriptUrl:string }
type ShippingRate = { id: string | null; name: string; price: number; freeAbove: number | null; estimatedDays: number | null }
const defaultSettings:StoreSettings={payment:{cod:true,card:false,bank:false,wallet:false,details:{bank:null,wallet:null}},checkout:{guestCheckout:true}}

declare global { interface Window { Checkout?: { configure: (options: unknown) => void; showPaymentPage: () => void } } }

export default function Checkout() {
  const { t, count: plural } = useI18n()
  const { selectedItems: items, selectedSubtotal: subtotal, clearSelected, addItem, ready: cartReady, items: cartItems } = useCart()
  const [recovering, setRecovering] = useState(false)
  // Ads: the shopper reached checkout with these items (once per visit for the same cart).
  useEffect(() => {
    if (!cartReady || recovering || !items.length) return
    trackInitiateCheckout(items.map(item => ({ id: String(item.productId), name: item.name, price: item.price / 100, quantity: item.quantity })), config.currency)
  }, [cartReady, recovering, items])
  const router = useRouter()
  const [savedCoupon, setSavedCoupon] = useState('')
  const [recoveredEmail, setRecoveredEmail] = useState('')
  // Signed-in customers get their account email and name filled in (only into empty boxes).
  const emailRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const checkoutToken = useRef('')
  const recoveryStarted = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ecom-coupon-code')
      if (saved) setSavedCoupon(saved)
    } catch {}
    try {
      let token = localStorage.getItem('ecom-checkout-token')
      if (!token) { token = crypto.randomUUID(); localStorage.setItem('ecom-checkout-token', token) }
      checkoutToken.current = token
    } catch { checkoutToken.current = crypto.randomUUID() }
  }, [])

  // Rehydrates the cart pictured in an abandoned-checkout recovery email: that link carries
  // ?recover=<token>, and /api/checkout/progress?token= looks up the exact cart captured for
  // it. Without this, "pick up where you left off" only worked by coincidence when the local
  // cart on this browser happened to still hold the same items. Merges into whatever's already
  // in the cart (never clobbers it) and is guarded against re-applying the same token twice
  // (double-adding quantities) both within this load and on a repeat visit to the same link.
  useEffect(() => {
    // Guards synchronously, before the fetch below even starts -- React's development-mode
    // double-invoke of effects (Strict Mode) would otherwise fire this twice for the same
    // mount, and since the localStorage guard is only written once the fetch resolves, both
    // invocations would start before either could see it and each add the recovered items,
    // silently doubling every quantity.
    if (recoveryStarted.current) return
    let token = ''
    try { token = new URLSearchParams(window.location.search).get('recover') || '' } catch { return }
    if (!token) return
    try { if (localStorage.getItem('ecom-recovered-token') === token) return } catch {}
    recoveryStarted.current = true
    setRecovering(true)
    fetch(`/api/checkout/progress?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const cart = data?.cart
        if (!cart || !Array.isArray(cart.items) || !cart.items.length) return
        for (const item of cart.items) {
          const productId = String(item?.productId || '').trim()
          if (!productId) continue
          addItem({
            productId,
            variantId: item.variantId ? String(item.variantId) : null,
            name: String(item.name || 'Product'),
            sku: productId,
            price: Math.max(0, Number(item.unitPrice) || 0),
            quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
          }, false, false)
        }
        if (typeof cart.email === 'string' && cart.email.includes('@')) setRecoveredEmail(cart.email)
        try { localStorage.setItem('ecom-recovered-token', token) } catch {}
      })
      .catch(() => {})
      .finally(() => { setRecovering(false); router.replace('/checkout', { scroll: false }) })
  }, [])

  function captureCheckoutProgress(email: string) {
    if (!checkoutToken.current || !email.includes('@') || !items.length) return
    const payload = { token: checkoutToken.current, email, items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, name: item.name, quantity: item.quantity, unitPrice: item.price })) }
    fetch('/api/checkout/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {})
  }

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
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([])
  const [selectedRateId, setSelectedRateId] = useState<string>('')
  const [shippingLoading, setShippingLoading] = useState(false)
  const shippingRequestId = useRef(0)
  const [country, setCountry] = useState('Lebanon')
  const [codesOpen, setCodesOpen] = useState(false)

  function loadShippingRates(country: string) {
    const trimmed = country.trim()
    if (!trimmed) { setShippingRates([]); setSelectedRateId(''); return }
    const requestId = ++shippingRequestId.current
    setShippingLoading(true)
    fetch(`/api/checkout/shipping-rates?country=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (requestId !== shippingRequestId.current) return
        const rates: ShippingRate[] = Array.isArray(data?.rates) ? data.rates : []
        setShippingRates(rates)
        setSelectedRateId(current => rates.some(r => (r.id || '') === current) ? current : (rates[0]?.id || ''))
      })
      .catch(() => { if (requestId === shippingRequestId.current) setShippingRates([]) })
      .finally(() => { if (requestId === shippingRequestId.current) setShippingLoading(false) })
  }

  useEffect(() => { loadShippingRates('Lebanon') }, [])
  // The area picked in the storefront's delivery bar fills in "Area / region".
  const [deliveryArea, setDeliveryArea] = useState('')
  useEffect(() => { setDeliveryArea(readDeliveryArea()) }, [])

  // Bumped by the "Try again" button to reload the settings.
  const [settingsAttempt, setSettingsAttempt] = useState(0)
  useEffect(()=>{
    let active=true
    // A brief network or server hiccup shouldn't break checkout: retry twice before giving up.
    const loadStoreSettings=async()=>{
      for(let attempt=0;;attempt+=1){
        try{
          const response=await fetch('/api/store/settings',{cache:'no-store'})
          const data=await response.json().catch(()=>({}))
          if(response.ok&&data.settings)return data.settings as StoreSettings
          if(attempt>=2)throw new Error(data.error||t('Unable to load checkout settings'))
        }catch(e){if(attempt>=2)throw e}
        await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))
        if(!active)throw new Error('cancelled')
      }
    }
    setSettingsError('')
    Promise.all([
      loadStoreSettings(),
      // Wallet and coins belong to an account: only ask for them once we know someone is
      // signed in (guests used to get two 401s logged on every checkout visit).
      fetch('/api/auth/session',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({authenticated:false}));const ok=Boolean(response.ok&&data.authenticated);if(ok&&active)fillAccountContact(data.user);return ok}).catch(()=>false).then(async isAuthenticated=>{
        if(!isAuthenticated)return [false,null,null] as const
        const read=(url:string)=>fetch(url,{cache:'no-store'}).then(async response=>{if(!response.ok)return null;return response.json().catch(()=>null)})
        const [wallet,coins]=await Promise.all([read('/api/account/wallet'),read('/api/account/coins')])
        return [true,wallet,coins] as const
      }),
    ]).then(([storeSettings,[isAuthenticated,wallet,coins]])=>{if(active){setSettings(storeSettings);setAuthenticated(isAuthenticated);setSessionLoaded(true);if(isAuthenticated&&wallet){setWalletBalance(Math.max(0,Number(wallet.balance||0)));setWalletCurrency(wallet.currency||'USD')}else{setWalletBalance(0)}if(isAuthenticated&&coins){setCoinBalance(Math.max(0,Number(coins.balance||0)))}else{setCoinBalance(0)}}}).catch(()=>{if(active){setSettings(defaultSettings);setAuthenticated(false);setSessionLoaded(true);setWalletBalance(0);setCoinBalance(0);setSettingsError(t("We couldn't load the latest checkout options, so cash on delivery is shown. Your order is still checked by the store when you place it."))}})
    return ()=>{active=false}
  },[settingsAttempt])

  function fillAccountContact(user: { email?: string | null; name?: string | null } | null | undefined) {
    const fill = (input: HTMLInputElement | null, value: string) => { if (input && !input.value.trim() && value) input.value = value }
    const parts = String(user?.name || '').trim().split(/\s+/).filter(Boolean)
    fill(emailRef.current, String(user?.email || '').trim())
    fill(firstNameRef.current, parts[0] || '')
    fill(lastNameRef.current, parts.slice(1).join(' '))
  }

  useEffect(()=>{
    if(!clientCheckout) return
    const launch=()=>{
      if(!window.Checkout) return
      window.Checkout.configure({ merchant: clientCheckout.merchantId, session: { id: clientCheckout.sessionId } })
      window.Checkout.showPaymentPage()
    }
    if(window.Checkout){launch();return}
    const script=document.createElement('script');script.src=clientCheckout.scriptUrl;script.async=true;script.onload=launch;script.onerror=()=>setError(t('Unable to load the secure payment page. Please try again.'));document.body.appendChild(script)
    return ()=>{script.onload=null}
  },[clientCheckout])

  const enabledMethods = settings ? [
    settings.payment.cod && ['COD',t('Cash on delivery')], settings.payment.card && ['CARD',t('Card')], settings.payment.bank && ['BANK_TRANSFER',t('Bank transfer')], settings.payment.wallet && authenticated && ['WALLET',t('Wallet · {amount} available',{amount:money(walletBalance,walletCurrency)})],
  ].filter(Boolean) as [string,string][] : []
  const guestBlocked = Boolean(settings && sessionLoaded && !authenticated && settings.checkout.guestCheckout===false)
  const enabledMethodSignature = enabledMethods.map(([value])=>value).join('|')
  useEffect(()=>{if(enabledMethods.length && !enabledMethods.some(([value])=>value===paymentMethod)) setPaymentMethod(enabledMethods[0][0])},[enabledMethodSignature,paymentMethod])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!items.length) { setError(t('Your cart is empty.')); return }
    if (!settings) { setError(t('Checkout settings are still loading. Please try again in a moment.')); return }
    if (!sessionLoaded) { setError(t('Authentication status is still loading. Please try again in a moment.')); return }
    if (guestBlocked) { setError(t('Guest checkout is disabled. Please sign in to continue.')); return }
    if (!enabledMethods.some(([value])=>value===paymentMethod)) { setError(t('Please choose an available payment method.')); return }
    if (coinsToUse > coinBalance) { setError(t('You do not have enough coins for this redemption.')); return }
    setLoading(true)
    const form = event.currentTarget; const fd = new FormData(form)
    const data = { email: String(fd.get('email') || ''), phone: String(fd.get('phone') || ''), paymentMethod, couponCode: String(fd.get('couponCode') || ''), giftCardCode: String(fd.get('giftCardCode') || ''), coinsToUse, shippingRateId: selectedRateId, shippingAddress: { firstName: String(fd.get('firstName') || ''), lastName: String(fd.get('lastName') || ''), line1: String(fd.get('line1') || ''), line2: String(fd.get('line2') || ''), city: String(fd.get('city') || ''), region: String(fd.get('region') || ''), postalCode: String(fd.get('postalCode') || ''), country: String(fd.get('country') || ''), phone: String(fd.get('phone') || '') }, items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity, bundleId: item.bundleId || null })) }
    try {
      const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':idempotencyKey.current},body:JSON.stringify(data)})
      const output=await response.json(); if(!response.ok)throw new Error(t(output.error||'Unable to place order'))
      clearSelected()
      try { localStorage.removeItem('ecom-coupon-code') } catch {}
      if (checkoutToken.current) {
        fetch('/api/checkout/progress', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: checkoutToken.current }), keepalive: true }).catch(() => {})
        try { localStorage.removeItem('ecom-checkout-token') } catch {}
      }
      try {
        // A recovered cart may have come from a different browser/device's own capture token
        // than this one's -- mark that original capture recovered too, or it lingers OPEN in
        // the admin abandoned-checkouts list forever even though the order actually completed.
        const recoveredToken = localStorage.getItem('ecom-recovered-token')
        if (recoveredToken && recoveredToken !== checkoutToken.current) {
          fetch('/api/checkout/progress', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: recoveredToken }), keepalive: true }).catch(() => {})
        }
        localStorage.removeItem('ecom-recovered-token')
      } catch {}
      if(output.payment?.type==='mpgs'){setClientCheckout(output.payment as ClientCheckout);setLoading(false);return}
      // The server signs the thank-you link (lib/order-access.ts); the order number alone shows nothing.
      const successUrl = typeof output.order.successPath === 'string' && output.order.successPath.startsWith('/order/success?') ? output.order.successPath : `/order/success?order=${encodeURIComponent(output.order.orderNumber)}`
      router.push(successUrl)
    } catch(e){setError(e instanceof Error?e.message:t('Unable to place order'));setLoading(false)}
  }

  const bankDetails = settings?.payment.details.bank
  // Delivery cost of the selected rate, so the summary shows the real total before paying.
  const selectedRate = shippingRates.find(rate => (rate.id || '') === selectedRateId) || shippingRates[0]
  const deliveryCost = selectedRate ? (selectedRate.freeAbove !== null && subtotal >= selectedRate.freeAbove ? 0 : selectedRate.price) : null
  // Lebanon doesn't use postal codes in practice; the field only shows for other countries.
  const needsPostalCode = !LEBANON.test(country.trim())
  const paymentNotes: Record<string, string> = { COD: t('Pay in cash when your order arrives.'), CARD: t('Pay securely by card on the next step.'), BANK_TRANSFER: t('Transfer to our bank account; we ship once it arrives.'), WALLET: t('Use your store wallet balance.') }
  const showBankDetails = paymentMethod==='BANK_TRANSFER' && bankDetails

  if(clientCheckout) return <main className="section"><div className="container narrow"><div className="card" style={{textAlign:'center'}}><span className="muted">{t('SECURE PAYMENT')}</span><h1 className="h2">{t('Continue to secure card payment')}</h1><p className="muted">{t("Your payment details are entered directly on the payment provider's secure page.")}</p><div className="alert">{t('Loading secure payment…')}</div><Link className="textLink" href="/cart">{t('Return to cart')}</Link></div></div></main>

  // Every item removed (or none selected in the cart): show that instead of a $0 order with only
  // the delivery fee in the total. Not while an abandoned cart is being restored, or right
  // after an order is placed (the cart empties just before the success page opens).
  if(cartReady && !items.length && !recovering && !loading) return <main className="section"><div className="container narrow"><div className="card" style={{textAlign:'center'}}><span className="muted">{t('CHECKOUT')}</span><h1 className="h2">{cartItems.length ? t('No items selected') : t('Your cart is empty')}</h1><p className="muted">{cartItems.length ? t('Choose the items you want to buy in your cart, then come back to check out.') : t('Add something you love, then come back to check out.')}</p><div className="inline" style={{justifyContent:'center',gap:12,flexWrap:'wrap'}}>{cartItems.length ? <Link className="btn" href="/cart">{t('Go to cart')}</Link> : <Link className="btn" href="/shop">{t('Continue shopping')}</Link>}</div></div></div></main>

  return <main className="section"><div className="container split"><form className="card checkoutForm" onSubmit={submit}>
    <span className="muted">{t('CHECKOUT')}</span><h1 className="h2">{t('Secure, simple, fast.')}</h1><CartNotices />
    {!settings && <div className="alert">{t('Loading checkout settings…')}</div>}
    {guestBlocked && <div className="alert danger">{t('Guest checkout is disabled.')} <Link className="textLink" href="/account/login?next=%2Fcheckout">{t('Sign in to continue')}</Link></div>}
    {settingsError && <div className="alert">{settingsError} <button type="button" className="textButton" onClick={()=>setSettingsAttempt(n=>n+1)}>{t('Try again')}</button></div>}
    <h3>{t('Contact')}</h3><label className="fieldLabel">{t('Email')}<input ref={emailRef} className="input" required name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" defaultValue={recoveredEmail} key={recoveredEmail} onBlur={e => captureCheckoutProgress(e.target.value.trim())} /></label><label className="fieldLabel">{t('Phone (WhatsApp)')}<input className="input" required name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder={t('e.g. 70 123 456')} minLength={6} dir="ltr" /><span className="muted" style={{fontSize:12}}>{t('The courier calls this number on delivery.')}</span></label>
    <h3>{t('Delivery')}</h3><div className="grid two"><label className="fieldLabel">{t('First name')}<input ref={firstNameRef} className="input" required name="firstName" autoComplete="given-name" placeholder={t('First name')} /></label><label className="fieldLabel">{t('Last name')}<input ref={lastNameRef} className="input" required name="lastName" autoComplete="family-name" placeholder={t('Last name')} /></label></div>
    <label className="fieldLabel">{t('Address')}<input className="input" required name="line1" autoComplete="address-line1" placeholder={t('Street address')} /></label><label className="fieldLabel">{t('Apartment, floor, etc.')} <span className="muted">{t('(optional)')}</span><input className="input" name="line2" autoComplete="address-line2" placeholder={t('Apartment, floor, etc.')} /></label>
    <div className="grid two"><label className="fieldLabel">{t('City')}<input className="input" required name="city" autoComplete="address-level2" placeholder={t('City')} /></label><label className="fieldLabel">{t('Area / region')} <span className="muted">{t('(optional)')}</span><input className="input" name="region" autoComplete="address-level1" placeholder={t('e.g. Metn, Keserwan')} key={deliveryArea} defaultValue={deliveryArea} /></label></div><div className={needsPostalCode ? 'grid two' : 'grid'}>{needsPostalCode && <label className="fieldLabel">{t('Postal code')} <span className="muted">{t('(optional)')}</span><input className="input" name="postalCode" autoComplete="postal-code" placeholder={t('Postal code')} /></label>}<label className="fieldLabel">{t('Country')}<input className="input" required name="country" autoComplete="country-name" placeholder={t('Country')} value={country} onChange={e => setCountry(e.target.value)} onBlur={e => loadShippingRates(e.target.value)} /></label></div>
    <h3>{t('Delivery method')}</h3>{shippingLoading && !shippingRates.length ? <div className="alert">{t('Loading delivery options…')}</div> : shippingRates.length > 1 ? <div className="grid" style={{gap:8}}>{shippingRates.map(rate => <label className="fieldLabel" key={rate.id || 'standard'} style={{flexDirection:'row',alignItems:'center',gap:10,cursor:'pointer'}}><input type="radio" name="shippingRateOption" checked={selectedRateId===(rate.id||'')} onChange={()=>setSelectedRateId(rate.id||'')} /><span style={{flex:1}}>{t(rate.name)}{rate.estimatedDays?` · ${plural(rate.estimatedDays,'day')}`:''}</span><strong>{rate.freeAbove!==null && subtotal>=rate.freeAbove ? t('Free') : money(rate.price)}</strong></label>)}</div> : shippingRates[0] ? <p className="muted">{t(shippingRates[0].name)}{shippingRates[0].estimatedDays?` · ${plural(shippingRates[0].estimatedDays,'day')}`:''}: {shippingRates[0].freeAbove!==null && subtotal>=shippingRates[0].freeAbove ? t('Free') : money(shippingRates[0].price)}</p> : null}
    <h3>{t('Payment')}</h3>{settings&&enabledMethods.length>0?<div className="checkoutPayOptions" role="radiogroup" aria-label={t('Payment method')}>{enabledMethods.map(([value,label])=><label key={value} className={`checkoutPayOption${paymentMethod===value?' selected':''}`}><input type="radio" name="paymentMethod" value={value} checked={paymentMethod===value} onChange={()=>setPaymentMethod(value)} /><span><strong>{label}</strong><small>{paymentNotes[value] || ''}</small></span></label>)}</div>:settings?<div className="alert danger">{t('No payment methods are currently enabled. Please contact the store.')}</div>:null}
    {paymentMethod==='WALLET' && authenticated && <div className={walletBalance>0?'alert':'alert danger'}><strong>{t('Store wallet')}</strong><div>{t('{amount} available for this order.',{amount:money(walletBalance,walletCurrency)})}</div></div>}
    {authenticated && coinBalance>0 && <div className="card" style={{padding:16,marginTop:12}}><strong>{t('Use loyalty coins')}</strong><p className="muted" style={{marginTop:4}}>{t('1 coin = 0.01 in store currency.')}</p><div className="inline" style={{marginTop:10,gap:10}}><input className="input" type="number" min="0" max={coinBalance} step="1" inputMode="numeric" value={coinsToUse||''} onChange={e=>setCoinsToUse(Math.max(0,Math.min(coinBalance,Number(e.target.value)||0)))} placeholder={t('Coins to use')} /><button className="btn secondary" type="button" onClick={()=>setCoinsToUse(coinBalance)}>{t('Use all')}</button></div>{coinsToUse>0&&<div className="muted" style={{marginTop:8}}>{t('Discount:')} {money(coinsToUse)}</div>}</div>}
    {showBankDetails && <div className="alert"><strong>{t('Bank transfer details')}</strong><div>{t('Bank:')} {bankDetails.bankName || '—'}</div><div>{t('Account name:')} {bankDetails.accountName || '—'}</div><div>IBAN: <span dir="ltr">{bankDetails.iban || '—'}</span></div>{bankDetails.instructions && <div>{bankDetails.instructions}</div>}</div>}
    {codesOpen || savedCoupon ? <div className="grid two">
      <label className="fieldLabel">{t('Discount code')}<input className="input" name="couponCode" autoCapitalize="characters" placeholder={t('Discount code')} defaultValue={savedCoupon} key={savedCoupon} /></label>
      <label className="fieldLabel">{t('Gift card')}<input className="input" name="giftCardCode" autoCapitalize="characters" placeholder={t('Gift card code')} /></label>
    </div> : <button type="button" className="textButton checkoutCodesToggle" onClick={()=>setCodesOpen(true)}>{t('Have a discount code or gift card?')}</button>}
    {error&&<div className="alert danger" role="alert" aria-live="polite">{error}</div>}
    <button className="btn" type="submit" disabled={loading||!items.length||!settings||!sessionLoaded||enabledMethods.length===0||guestBlocked} aria-busy={loading}>{loading?t('Placing order…'):`${t('Place order')}${deliveryCost!==null?` · ${money(subtotal+deliveryCost)}`:''}`}</button><Link className="textLink" href="/cart">{t('Back to cart')}</Link>
  </form><aside className="card summaryCard"><span className="muted">{t('ORDER SUMMARY')}</span>{items.map(item=><div className="summaryLine" key={item.productId+String(item.variantId)}><span>{item.name} × {item.quantity}</span><strong>{money(item.price*item.quantity)}</strong></div>)}<div className="summaryLine"><span>{t('Subtotal')}</span><strong>{money(subtotal)}</strong></div><div className="summaryLine"><span>{t('Delivery')}</span><strong>{deliveryCost===null?'—':deliveryCost===0?t('Free'):money(deliveryCost)}</strong></div><div className="summaryLine total"><span>{t('Total')}</span><strong>{money(subtotal+(deliveryCost||0))}</strong></div><p className="muted" style={{fontSize:12}}>{t('Discount codes and any tax are applied when you place the order.')}</p></aside></div></main>
}
