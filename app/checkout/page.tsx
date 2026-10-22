'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Banknote, Check, ChevronDown, CreditCard, Gift, Landmark, Lock, ShieldCheck, ShoppingBag, Truck, Wallet, X } from 'lucide-react'
import { readDeliveryArea } from '@/components/market-chrome'
import { useCart } from '@/components/cart-provider'
import { config, money } from '@/lib/config'
import { trackInitiateCheckout } from '@/lib/tracking-events'
import { CartNotices } from '@/components/cart-notices'
import { useI18n } from '@/components/lang-provider'
import { internationalPhone } from '@/lib/phone'
import { LbpNote } from '@/components/selling-client'
import { countryCode as isoCountryCode, countryName } from '@/lib/delivery-countries'
import { type LocationPin } from '@/lib/location-pin'
import LocationPinButton from './location-pin'
import s from './checkout.module.css'

// Checkout: phone first, email optional (many customers in Lebanon don't want to give one), the
// delivery area picked from the store's list (delivery can cost more outside Beirut), then
// payment. The summary shows the exact total from the server (/api/checkout/quote): discount
// code, automatic discounts, bundles, delivery for the chosen area and tax.

// "Lebanon" in English or Arabic. Written as escapes so the server bundle stays Latin-only
// (see scripts/check-worker-charset.mjs).
const LEBANON = new RegExp('^(lebanon|lb|\\u0644\\u0628\\u0646\\u0627\\u0646)$', 'i')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type PaymentDetails = {
  bank: { bankName: string; accountName: string; iban: string; instructions: string } | null
  wallet: { provider: string; accountName: string; accountNumber: string; instructions: string } | null
}
type StoreSettings = { payment: { cod: boolean; card: boolean; bank: boolean; wallet: boolean; details: PaymentDetails }; checkout: { guestCheckout: boolean; countries?: Array<{ code: string; name: string }> }; selling?: { giftOption?: boolean; lbp?: { show: boolean; rate: number } } | null }
type ClientCheckout = { type: 'mpgs'; merchantId: string; sessionId: string; scriptUrl: string }
type ShippingRate = { id: string | null; name: string; price: number; freeAbove: number | null; estimatedDays: number | null }
type DeliveryArea = { name: string; eta: string }
type Quote = { subtotal: number; discount: number; discountCode: string | null; automaticDiscount: boolean; bundleDiscount: number; shipping: number; freeShipping: boolean; tax: number; total: number; couponError: string; freeGift?: { name: string; image: string } | null }
const defaultSettings: StoreSettings = { payment: { cod: true, card: false, bank: false, wallet: false, details: { bank: null, wallet: null } }, checkout: { guestCheckout: true } }
const PAYMENT_ICONS: Record<string, typeof Banknote> = { COD: Banknote, CARD: CreditCard, BANK_TRANSFER: Landmark, WALLET: Wallet }
// The fields checked before the order is sent, in the order they appear (the first problem is scrolled to).
const FIELD_ORDER = ['phone', 'email', 'area', 'firstName', 'lastName', 'city', 'line1', 'country'] as const

declare global { interface Window { Checkout?: { configure: (options: unknown) => void; showPaymentPage: () => void } } }

export default function Checkout() {
  const { t, count: plural, lang } = useI18n()
  const { selectedItems: items, selectedSubtotal: subtotal, clearSelected, addItem, ready: cartReady, items: cartItems } = useCart()
  const [recovering, setRecovering] = useState(false)
  // Ads: the shopper reached checkout with these items (once per visit for the same cart).
  useEffect(() => {
    if (!cartReady || recovering || !items.length) return
    trackInitiateCheckout(items.map(item => ({ id: String(item.productId), name: item.name, price: item.price / 100, quantity: item.quantity })), config.currency)
  }, [cartReady, recovering, items])
  const router = useRouter()
  const [recoveredEmail, setRecoveredEmail] = useState('')
  // Signed-in customers get their account email and name filled in (only into empty boxes).
  const emailRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const checkoutToken = useRef('')
  const recoveryStarted = useRef(false)

  // Discount code: typed, then applied (checked by the server, shown in the summary).
  const [codeInput, setCodeInput] = useState('')
  const [appliedCode, setAppliedCode] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ecom-coupon-code')
      if (saved) { setCodeInput(saved); setAppliedCode(saved); setCodeOpen(true) }
    } catch {}
    try {
      let token = localStorage.getItem('ecom-checkout-token')
      if (!token) { token = crypto.randomUUID(); localStorage.setItem('ecom-checkout-token', token) }
      checkoutToken.current = token
    } catch { checkoutToken.current = crypto.randomUUID() }
  }, [])

  // Rehydrates the cart pictured in an abandoned-checkout recovery email: that link carries
  // ?recover=<token>, and /api/checkout/progress?token= looks up the exact cart captured for
  // it. Merges into whatever's already in the cart (never clobbers it) and is guarded against
  // re-applying the same token twice (double-adding quantities) both within this load and on a
  // repeat visit to the same link; the synchronous ref guard also covers React's development
  // double-invoke of effects.
  useEffect(() => {
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

  // Saves the cart for "unfinished checkout" follow-up once there is a way to reach the shopper:
  // a phone number (most customers) or an email. Called when they leave the phone, email or
  // first-name box; sends again only when something changed.
  const lastProgress = useRef('')
  // The phone/email typed so far, for "first order only" codes (the welcome code) in the price.
  const [contact, setContact] = useState({ phone: '', email: '' })
  function captureCheckoutProgress(form: HTMLFormElement | null | undefined) {
    if (!form || !checkoutToken.current || !items.length) return
    const fd = new FormData(form)
    const typedEmail = String(fd.get('email') || '').trim()
    const email = EMAIL.test(typedEmail) ? typedEmail : ''
    const phone = String(fd.get('phone') || '').trim()
    const name = String(fd.get('firstName') || '').trim()
    if (!email && phone.replace(/\D/g, '').length < 7) return
    const payload = { token: checkoutToken.current, email, phone, name, items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, name: item.name, quantity: item.quantity, unitPrice: item.price })) }
    const key = JSON.stringify(payload)
    setContact(current => current.phone === phone && current.email === email ? current : { phone, email })
    if (key === lastProgress.current) return
    lastProgress.current = key
    fetch('/api/checkout/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: key, keepalive: true }).catch(() => {})
  }

  const idempotencyKey = useRef(crypto.randomUUID())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [clientCheckout, setClientCheckout] = useState<ClientCheckout | null>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletCurrency, setWalletCurrency] = useState('USD')
  const [coinBalance, setCoinBalance] = useState(0)
  const [coinsToUse, setCoinsToUse] = useState(0)
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Where it goes: a country the store delivers to (Settings > Shipping & delivery; its own
  // country first, so Lebanon unless changed), the area from the store's list, the rate.
  const [country, setCountry] = useState('Lebanon')
  // The customer's shared location, if they tapped "Share my exact location" (app/checkout/location-pin.tsx).
  const [pin, setPin] = useState<LocationPin | null>(null)
  const [areas, setAreas] = useState<DeliveryArea[]>([])
  const [area, setArea] = useState('')
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([])
  const [selectedRateId, setSelectedRateId] = useState<string>('')
  const [shippingLoading, setShippingLoading] = useState(false)
  const shippingRequestId = useRef(0)
  const inLebanon = LEBANON.test(country.trim())
  const useAreaList = areas.length > 0

  useEffect(() => { const saved = readDeliveryArea(); if (saved) setArea(saved) }, [])
  useEffect(() => {
    const trimmed = country.trim()
    if (!trimmed) { setShippingRates([]); setSelectedRateId(''); return }
    const requestId = ++shippingRequestId.current
    setShippingLoading(true)
    const timer = setTimeout(() => {
      fetch(`/api/checkout/shipping-rates?country=${encodeURIComponent(trimmed)}&region=${encodeURIComponent(area)}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (requestId !== shippingRequestId.current) return
          const rates: ShippingRate[] = Array.isArray(data?.rates) ? data.rates : []
          const list: DeliveryArea[] = Array.isArray(data?.areas) ? data.areas : []
          setShippingRates(rates)
          setAreas(list)
          // A saved area that isn't on the store's list any more is dropped, so the customer picks again.
          if (list.length && area && !list.some(a => a.name === area)) setArea('')
          setSelectedRateId(current => rates.some(r => (r.id || '') === current) ? current : (rates[0]?.id || ''))
        })
        .catch(() => { if (requestId === shippingRequestId.current) setShippingRates([]) })
        .finally(() => { if (requestId === shippingRequestId.current) setShippingLoading(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [country, area])

  // Bumped by the "Try again" button to reload the settings.
  const [settingsAttempt, setSettingsAttempt] = useState(0)
  useEffect(() => {
    let active = true
    // A brief network or server hiccup shouldn't break checkout: retry twice before giving up.
    const loadStoreSettings = async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await fetch('/api/store/settings', { cache: 'no-store' })
          const data = await response.json().catch(() => ({}))
          if (response.ok && data.settings) return data.settings as StoreSettings
          if (attempt >= 2) throw new Error(data.error || t('Unable to load checkout settings'))
        } catch (e) { if (attempt >= 2) throw e }
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
        if (!active) throw new Error('cancelled')
      }
    }
    setSettingsError('')
    Promise.all([
      loadStoreSettings(),
      // Wallet and coins belong to an account: only ask for them once someone is signed in.
      fetch('/api/auth/session', { cache: 'no-store' }).then(async response => { const data = await response.json().catch(() => ({ authenticated: false })); const ok = Boolean(response.ok && data.authenticated); if (ok && active) fillAccountContact(data.user); return ok }).catch(() => false).then(async isAuthenticated => {
        if (!isAuthenticated) return [false, null, null] as const
        const read = (url: string) => fetch(url, { cache: 'no-store' }).then(async response => { if (!response.ok) return null; return response.json().catch(() => null) })
        const [wallet, coins] = await Promise.all([read('/api/account/wallet'), read('/api/account/coins')])
        return [true, wallet, coins] as const
      }),
    ]).then(([storeSettings, [isAuthenticated, wallet, coins]]) => {
      if (!active) return
      setSettings(storeSettings); setAuthenticated(isAuthenticated); setSessionLoaded(true)
      if (isAuthenticated && wallet) { setWalletBalance(Math.max(0, Number(wallet.balance || 0))); setWalletCurrency(wallet.currency || 'USD') } else setWalletBalance(0)
      setCoinBalance(isAuthenticated && coins ? Math.max(0, Number(coins.balance || 0)) : 0)
    }).catch(() => {
      if (!active) return
      setSettings(defaultSettings); setAuthenticated(false); setSessionLoaded(true); setWalletBalance(0); setCoinBalance(0)
      setSettingsError(t("We couldn't load the latest checkout options, so cash on delivery is shown. Your order is still checked by the store when you place it."))
    })
    return () => { active = false }
  }, [settingsAttempt])

  function fillAccountContact(user: { email?: string | null; name?: string | null } | null | undefined) {
    const fill = (input: HTMLInputElement | null, value: string) => { if (input && !input.value.trim() && value) input.value = value }
    const parts = String(user?.name || '').trim().split(/\s+/).filter(Boolean)
    fill(emailRef.current, String(user?.email || '').trim())
    fill(firstNameRef.current, parts[0] || '')
    fill(lastNameRef.current, parts.slice(1).join(' '))
  }

  useEffect(() => {
    if (!clientCheckout) return
    const launch = () => {
      if (!window.Checkout) return
      window.Checkout.configure({ merchant: clientCheckout.merchantId, session: { id: clientCheckout.sessionId } })
      window.Checkout.showPaymentPage()
    }
    if (window.Checkout) { launch(); return }
    const script = document.createElement('script'); script.src = clientCheckout.scriptUrl; script.async = true; script.onload = launch; script.onerror = () => setError(t('Unable to load the secure payment page. Please try again.')); document.body.appendChild(script)
    return () => { script.onload = null }
  }, [clientCheckout])

  const enabledMethods = settings ? [
    settings.payment.cod && ['COD', t('Cash on delivery')], settings.payment.card && ['CARD', t('Card')], settings.payment.bank && ['BANK_TRANSFER', t('Bank transfer')], settings.payment.wallet && authenticated && ['WALLET', t('Wallet · {amount} available', { amount: money(walletBalance, walletCurrency) })],
  ].filter(Boolean) as [string, string][] : []
  const guestBlocked = Boolean(settings && sessionLoaded && !authenticated && settings.checkout.guestCheckout === false)
  // Only the countries the store delivers to; the first is its own country.
  const countries = useMemo(() => settings?.checkout.countries?.length ? settings.checkout.countries : [{ code: 'LB', name: 'Lebanon' }], [settings])
  useEffect(() => { if (!countries.some(c => c.name === country)) setCountry(countries[0].name) }, [countries, country])
  const enabledMethodSignature = enabledMethods.map(([value]) => value).join('|')
  useEffect(() => { if (enabledMethods.length && !enabledMethods.some(([value]) => value === paymentMethod)) setPaymentMethod(enabledMethods[0][0]) }, [enabledMethodSignature, paymentMethod])

  // The exact price from the server: asked again when the cart, area, rate or code changes.
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const quoteRequestId = useRef(0)
  const cartKey = useMemo(() => items.map(i => `${i.productId}:${i.variantId || ''}:${i.quantity}:${i.bundleId || ''}`).join('|'), [items])
  useEffect(() => {
    if (!cartReady || recovering || !items.length || !country.trim()) return
    const requestId = ++quoteRequestId.current
    setQuoting(true)
    const timer = setTimeout(() => {
      fetch('/api/checkout/quote', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity, bundleId: item.bundleId || null })), couponCode: appliedCode, country: country.trim(), region: area, shippingRateId: selectedRateId, phone: contact.phone, email: contact.email }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((data: Quote | null) => {
          if (requestId !== quoteRequestId.current) return
          setQuote(data && typeof data.total === 'number' ? data : null)
          // A code the server turned down is taken off, with the reason under the box.
          if (data?.couponError && appliedCode) { setAppliedCode(''); try { localStorage.removeItem('ecom-coupon-code') } catch {} }
        })
        .catch(() => { if (requestId === quoteRequestId.current) setQuote(null) })
        .finally(() => { if (requestId === quoteRequestId.current) setQuoting(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [cartReady, recovering, cartKey, country, area, selectedRateId, appliedCode, appliedCode ? contact.phone : '', appliedCode ? contact.email : ''])
  const [codeMessage, setCodeMessage] = useState('')
  // "This is a gift" (Settings > Selling tools > Gift option).
  const [isGift, setIsGift] = useState(false)
  const [giftMessage, setGiftMessage] = useState('')
  const lbpRate = settings?.selling?.lbp?.show ? settings.selling.lbp.rate : 0
  useEffect(() => { if (quote?.couponError) setCodeMessage(quote.couponError) }, [quote?.couponError])

  function applyCode() {
    const code = codeInput.trim().toUpperCase()
    setCodeMessage('')
    if (!code) return
    setAppliedCode(code)
    try { localStorage.setItem('ecom-coupon-code', code) } catch {}
  }
  function removeCode() {
    setAppliedCode(''); setCodeInput(''); setCodeMessage('')
    try { localStorage.removeItem('ecom-coupon-code') } catch {}
  }

  function check(fd: FormData) {
    const value = (name: string) => String(fd.get(name) || '').trim()
    const problems: Record<string, string> = {}
    const phone = value('phone')
    if (phone.replace(/\D/g, '').length < 6) problems.phone = t('Enter your phone number so the courier can reach you.')
    else if (inLebanon && !internationalPhone(phone, 'Lebanon')) problems.phone = t('This number looks incomplete. Check it, e.g. 70 123 456.')
    const email = value('email')
    if (email && !EMAIL.test(email)) problems.email = t('This email looks wrong. Fix it or leave it empty.')
    if (useAreaList && !area) problems.area = t('Choose your area.')
    if (!value('firstName')) problems.firstName = t('Enter your first name.')
    if (!value('lastName')) problems.lastName = t('Enter your last name.')
    if (!value('city')) problems.city = t('Enter your town or city.')
    if (!value('line1')) problems.line1 = t('Enter your street and building.')
    if (!country.trim()) problems.country = t('Enter your country.')
    return problems
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!items.length) { setError(t('Your cart is empty.')); return }
    if (!settings) { setError(t('Checkout settings are still loading. Please try again in a moment.')); return }
    if (!sessionLoaded) { setError(t('Authentication status is still loading. Please try again in a moment.')); return }
    if (guestBlocked) { setError(t('Guest checkout is disabled. Please sign in to continue.')); return }
    if (!enabledMethods.some(([value]) => value === paymentMethod)) { setError(t('Please choose an available payment method.')); return }
    if (coinsToUse > coinBalance) { setError(t('You do not have enough coins for this redemption.')); return }
    // A code typed but never applied: ask, rather than silently dropping it or failing the order.
    // One the server already turned down is simply left out.
    if (codeInput.trim() && codeInput.trim().toUpperCase() !== appliedCode && !codeMessage) {
      setSummaryOpen(true); setCodeMessage('Tap Apply to use your discount code, or clear it.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const form = event.currentTarget; const fd = new FormData(form)
    const problems = check(fd)
    setErrors(problems)
    const first = FIELD_ORDER.find(name => problems[name])
    if (first) {
      const el = form.querySelector<HTMLElement>(`[name="${first}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true })
      return
    }
    setLoading(true)
    const value = (name: string) => String(fd.get(name) || '').trim()
    const data = {
      email: value('email').toLowerCase(), phone: value('phone'), paymentMethod,
      couponCode: appliedCode, giftCardCode: value('giftCardCode'), coinsToUse, shippingRateId: selectedRateId,
      isGift, giftMessage: isGift ? giftMessage.trim() : '',
      shippingAddress: { firstName: value('firstName'), lastName: value('lastName'), line1: value('line1'), line2: value('line2'), city: value('city'), region: useAreaList ? area : value('region'), postalCode: value('postalCode'), country: country.trim(), phone: value('phone'), ...(pin ? { lat: pin.lat, lng: pin.lng, ...(pin.accuracy !== null ? { locationAccuracy: pin.accuracy } : {}) } : {}) },
      items: items.map(item => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity, bundleId: item.bundleId || null })),
    }
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey.current }, body: JSON.stringify(data) })
      const output = await response.json(); if (!response.ok) throw new Error(t(output.error || 'Unable to place order'))
      clearSelected()
      try { localStorage.removeItem('ecom-coupon-code') } catch {}
      if (checkoutToken.current) {
        fetch('/api/checkout/progress', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: checkoutToken.current }), keepalive: true }).catch(() => {})
        try { localStorage.removeItem('ecom-checkout-token') } catch {}
      }
      try {
        // A recovered cart may have come from another device's capture token: mark that one
        // recovered too, or it lingers in the admin's abandoned checkouts.
        const recoveredToken = localStorage.getItem('ecom-recovered-token')
        if (recoveredToken && recoveredToken !== checkoutToken.current) {
          fetch('/api/checkout/progress', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: recoveredToken }), keepalive: true }).catch(() => {})
        }
        localStorage.removeItem('ecom-recovered-token')
      } catch {}
      if (output.payment?.type === 'mpgs') { setClientCheckout(output.payment as ClientCheckout); setLoading(false); return }
      // The server signs the thank-you link (lib/order-access.ts); the order number alone shows nothing.
      const successUrl = typeof output.order.successPath === 'string' && output.order.successPath.startsWith('/order/success?') ? output.order.successPath : `/order/success?order=${encodeURIComponent(output.order.orderNumber)}`
      router.push(successUrl)
    } catch (e) { setError(e instanceof Error ? e.message : t('Unable to place order')); setLoading(false) }
  }

  const bankDetails = settings?.payment.details.bank
  const selectedRate = shippingRates.find(rate => (rate.id || '') === selectedRateId) || shippingRates[0]
  const rateCost = (rate: ShippingRate) => rate.freeAbove !== null && subtotal >= rate.freeAbove ? 0 : rate.price
  // Before the server's price arrives: the cart and the chosen rate.
  const deliveryCost = quote ? quote.shipping : selectedRate ? rateCost(selectedRate) : null
  const total = quote ? Math.max(0, quote.total - coinsToUse) : subtotal + (deliveryCost || 0) - coinsToUse
  const areaEta = areas.find(a => a.name === area)?.eta || ''
  const paymentNotes: Record<string, string> = { COD: t('Pay in cash when your order arrives.'), CARD: t('Pay securely by card on the next step.'), BANK_TRANSFER: t('Transfer to our bank account; we ship once it arrives.'), WALLET: t('Use your store wallet balance.') }
  const showBankDetails = paymentMethod === 'BANK_TRANSFER' && bankDetails
  const fieldClass = (name: string) => `${s.field} ${errors[name] ? s.invalid : ''}`
  const clearError = (name: string) => { if (errors[name]) setErrors(current => { const next = { ...current }; delete next[name]; return next }) }
  const fieldError = (name: string) => errors[name] ? <span className={s.error} role="alert">{errors[name]}</span> : null

  if (clientCheckout) return <main className={s.page}><div className={s.center}><Lock size={28} /><h1>{t('Continue to secure card payment')}</h1><p className={s.muted}>{t("Your payment details are entered directly on the payment provider's secure page.")}</p><div className={s.info}>{t('Loading secure payment…')}</div><Link className={s.back} href="/cart">{t('Return to cart')}</Link></div></main>

  // Every item removed (or none selected in the cart): say so instead of a $0 order. Not while an
  // abandoned cart is being restored, or right after an order is placed (the cart empties just
  // before the thank-you page opens).
  if (cartReady && !items.length && !recovering && !loading) return <main className={s.page}><div className={s.center}><ShoppingBag size={30} /><h1>{cartItems.length ? t('No items selected') : t('Your cart is empty')}</h1><p className={s.muted}>{cartItems.length ? t('Choose the items you want to buy in your cart, then come back to check out.') : t('Add something you love, then come back to check out.')}</p>{cartItems.length ? <Link className={s.centerBtn} href="/cart">{t('Go to cart')}</Link> : <Link className={s.centerBtn} href="/shop">{t('Continue shopping')}</Link>}</div></main>

  const summary = <aside className={s.summary} aria-label={t('Order summary')}>
    <button type="button" className={`${s.summaryToggle} ${summaryOpen ? s.summaryToggleOpen : ''}`} aria-expanded={summaryOpen} onClick={() => setSummaryOpen(!summaryOpen)}>
      <ShoppingBag size={18} /><span>{summaryOpen ? t('Hide order summary') : t('Show order summary')}</span><strong>{money(total)}</strong><ChevronDown size={18} />
    </button>
    <div className={`${s.summaryBody} ${summaryOpen ? '' : s.summaryBodyClosed}`}>
      <h2 className={s.summaryTitle}>{t('Your order')}</h2>
      <ul className={s.items}>
        {items.map(item => <li className={s.item} key={item.productId + String(item.variantId)}>
          <span className={s.thumb}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : null}<span className={s.qty}>{item.quantity}</span></span>
          <span className={s.itemName}>{item.name}</span>
          <span className={s.itemPrice}>{money(item.price * item.quantity)}</span>
        </li>)}
        {quote?.freeGift && <li className={s.item}>
          <span className={s.thumb}>{quote.freeGift.image ? <img src={quote.freeGift.image} alt="" loading="lazy" /> : null}<span className={s.qty}>1</span></span>
          <span className={s.itemName}>{quote.freeGift.name} <em className={s.giftTag}>{t('Free gift')}</em></span>
          <span className={`${s.itemPrice} ${s.free}`}>{t('Free')}</span>
        </li>}
      </ul>
      {appliedCode && quote?.discountCode
        ? <span className={s.applied}><Check size={14} /> {quote.discountCode}<button type="button" onClick={removeCode} aria-label={t('Remove discount code')}><X size={14} /></button></span>
        : codeOpen
          ? <div className={s.code}><input className={s.input} value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeMessage('') }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }} autoCapitalize="characters" placeholder={t('Discount code')} aria-label={t('Discount code')} /><button type="button" className={s.codeBtn} onClick={applyCode} disabled={!codeInput.trim() || quoting}>{t('Apply')}</button></div>
          : <button type="button" className={s.linkBtn} onClick={() => setCodeOpen(true)}>{t('Have a discount code?')}</button>}
      {codeMessage && !appliedCode && <p className={s.codeError} role="alert">{t(codeMessage)}</p>}
      <div className={s.totals}>
        <div><span>{t('Subtotal')}</span><strong>{money(quote?.subtotal ?? subtotal)}</strong></div>
        {quote && quote.discount > 0 && <div className={s.saving}><span>{quote.discountCode ? t('Discount ({code})', { code: quote.discountCode }) : t('Discount')}</span><strong>−{money(quote.discount)}</strong></div>}
        {coinsToUse > 0 && <div className={s.saving}><span>{t('Coins')}</span><strong>−{money(coinsToUse)}</strong></div>}
        <div><span>{t('Delivery')}{area ? ` · ${area}` : ''}</span><strong>{deliveryCost === null ? '—' : deliveryCost === 0 ? <span className={s.free}>{t('Free')}</span> : money(deliveryCost)}</strong></div>
        {quote && quote.tax > 0 && <div><span>{t('Tax')}</span><strong>{money(quote.tax)}</strong></div>}
        <div className={s.grand}><span>{t('Total')}</span><strong>{money(total)}</strong></div>
        {lbpRate > 0 && total > 0 && <LbpNote cents={total} rate={lbpRate} className={s.lbp} />}
      </div>
      {paymentMethod === 'COD' && <p className={`${s.muted} ${s.small}`}>{t('You pay this in cash when your order arrives.')}</p>}
    </div>
  </aside>

  return <main className={s.page}><div className={s.wrap}>
    <div className={s.head}><h1 className={s.title}>{t('Checkout')}</h1><span className={s.secure}><ShieldCheck size={16} /> {t('Secure checkout')}</span></div>
    {summary}
    <form className={s.form} onSubmit={submit} noValidate onInput={e => clearError((e.target as HTMLInputElement).name)}>
      <CartNotices />
      {!settings && <div className={s.info}>{t('Loading checkout settings…')}</div>}
      {guestBlocked && <div className={s.alert}>{t('Guest checkout is disabled.')} <Link href="/account/login?next=%2Fcheckout">{t('Sign in to continue')}</Link></div>}
      {settingsError && <div className={s.info}>{settingsError} <button type="button" className={s.linkBtn} onClick={() => setSettingsAttempt(n => n + 1)}>{t('Try again')}</button></div>}

      <section className={s.step} aria-labelledby="co-contact">
        <h2 id="co-contact" className={s.stepHead}><span className={s.stepNum}>1</span>{t('Contact')}</h2>
        <label className={fieldClass('phone')}><span className={s.label}>{t('Phone (WhatsApp)')}</span>
          <span className={s.phone}>{inLebanon && <span className={s.phonePrefix}>+961</span>}<input className={s.input} name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder={t('e.g. 70 123 456')} dir="ltr" aria-invalid={!!errors.phone} onBlur={e => captureCheckoutProgress(e.currentTarget.form)} /></span>
          {fieldError('phone') || <span className={s.help}>{t('We confirm your order and the courier calls you on this number.')}</span>}
        </label>
        <label className={fieldClass('email')}><span className={s.label}>{t('Email')} <i>{t('(optional)')}</i></span>
          <input ref={emailRef} className={s.input} name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" defaultValue={recoveredEmail} key={recoveredEmail} dir="ltr" aria-invalid={!!errors.email} onBlur={e => captureCheckoutProgress(e.currentTarget.form)} />
          {fieldError('email') || <span className={s.help}>{t('For your receipt and order updates.')}</span>}
        </label>
      </section>

      <section className={s.step} aria-labelledby="co-delivery">
        <h2 id="co-delivery" className={s.stepHead}><span className={s.stepNum}>2</span>{t('Delivery')}</h2>
        {useAreaList && <label className={fieldClass('area')}><span className={s.label}>{t('Area')}</span>
          <select className={s.select} name="area" value={area} onChange={e => { setArea(e.target.value); clearError('area') }} aria-invalid={!!errors.area}>
            <option value="">{t('Choose your area')}</option>
            {areas.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          {fieldError('area') || (areaEta ? <span className={s.help}><Truck size={13} style={{ verticalAlign: '-2px' }} /> {t('Delivery: {when}', { when: areaEta })}</span> : null)}
        </label>}
        <div className={`${s.row} ${s.row2}`}>
          <label className={fieldClass('firstName')}><span className={s.label}>{t('First name')}</span><input ref={firstNameRef} className={s.input} name="firstName" autoComplete="given-name" aria-invalid={!!errors.firstName} onBlur={e => captureCheckoutProgress(e.currentTarget.form)} />{fieldError('firstName')}</label>
          <label className={fieldClass('lastName')}><span className={s.label}>{t('Last name')}</span><input ref={lastNameRef} className={s.input} name="lastName" autoComplete="family-name" aria-invalid={!!errors.lastName} />{fieldError('lastName')}</label>
        </div>
        <label className={fieldClass('city')}><span className={s.label}>{t('Town / city')}</span><input className={s.input} name="city" autoComplete="address-level2" placeholder={t('e.g. Jounieh')} aria-invalid={!!errors.city} />{fieldError('city')}</label>
        <label className={fieldClass('line1')}><span className={s.label}>{t('Street and building')}</span><input className={s.input} name="line1" autoComplete="address-line1" placeholder={t('e.g. Main street, Abi Nader building')} aria-invalid={!!errors.line1} />{fieldError('line1')}</label>
        <label className={s.field}><span className={s.label}>{t('Floor, apartment, landmark')} <i>{t('(optional)')}</i></span><input className={s.input} name="line2" autoComplete="address-line2" placeholder={t('e.g. 3rd floor, near the pharmacy')} /></label>
        <LocationPinButton pin={pin} onChange={setPin} countryCode={isoCountryCode(country)} />
        {!useAreaList && <label className={s.field}><span className={s.label}>{t('Area / region')} <i>{t('(optional)')}</i></span><input className={s.input} name="region" autoComplete="address-level1" /></label>}
        {!inLebanon && <label className={s.field}><span className={s.label}>{t('Postal code')} <i>{t('(optional)')}</i></span><input className={s.input} name="postalCode" autoComplete="postal-code" /></label>}
        {countries.length > 1
          ? <label className={fieldClass('country')}><span className={s.label}>{t('Country')}</span>
            <select className={s.select} name="country" autoComplete="country-name" value={country} onChange={e => { setCountry(e.target.value); clearError('country') }} aria-invalid={!!errors.country}>
              {countries.map(c => <option key={c.code} value={c.name}>{countryName(c.code, lang)}</option>)}
            </select>{fieldError('country')}</label>
          : <div className={s.countryLine}><span>{t('Country:')} <strong>{countries[0] ? countryName(countries[0].code, lang) : country}</strong></span></div>}

        <div className={s.field}>
          <span className={s.label}>{t('Delivery method')}</span>
          {shippingLoading && !shippingRates.length
            ? <div className={s.note}>{t('Loading delivery options…')}</div>
            : <div className={s.choices} role="radiogroup" aria-label={t('Delivery method')}>
                {shippingRates.map(rate => {
                  const on = selectedRateId === (rate.id || '')
                  const cost = rateCost(rate)
                  const when = areaEta || (rate.estimatedDays ? plural(rate.estimatedDays, 'day') : '')
                  return <label key={rate.id || 'standard'} className={`${s.choice} ${on ? s.choiceOn : ''}`}>
                    <input type="radio" name="shippingRateOption" checked={on} onChange={() => setSelectedRateId(rate.id || '')} />
                    <span className={s.choiceDot} aria-hidden="true" />
                    <span className={s.choiceText}><strong>{t(rate.name)}</strong>{when && <small>{when}</small>}</span>
                    <span className={`${s.choicePrice} ${cost === 0 ? s.free : ''}`}>{cost === 0 ? t('Free') : money(cost)}</span>
                  </label>
                })}
              </div>}
        </div>
      </section>

      <section className={s.step} aria-labelledby="co-payment">
        <h2 id="co-payment" className={s.stepHead}><span className={s.stepNum}>3</span>{t('Payment')}</h2>
        {settings && enabledMethods.length > 0
          ? <div className={s.choices} role="radiogroup" aria-label={t('Payment method')}>
              {enabledMethods.map(([value, label]) => {
                const Icon = PAYMENT_ICONS[value] || Banknote
                const on = paymentMethod === value
                return <label key={value} className={`${s.choice} ${on ? s.choiceOn : ''}`}>
                  <input type="radio" name="paymentMethod" value={value} checked={on} onChange={() => setPaymentMethod(value)} />
                  <span className={s.choiceDot} aria-hidden="true" />
                  <span className={s.choiceIcon}><Icon size={18} /></span>
                  <span className={s.choiceText}><strong>{label}</strong><small>{paymentNotes[value] || ''}</small></span>
                </label>
              })}
            </div>
          : settings ? <div className={s.alert}>{t('No payment methods are currently enabled. Please contact the store.')}</div> : null}
        {paymentMethod === 'WALLET' && authenticated && <div className={s.note}><strong>{t('Store wallet')}</strong>{t('{amount} available for this order.', { amount: money(walletBalance, walletCurrency) })}</div>}
        {showBankDetails && <div className={s.note}><strong>{t('Bank transfer details')}</strong>{t('Bank:')} {bankDetails.bankName || '—'}<br />{t('Account name:')} {bankDetails.accountName || '—'}<br />IBAN: <span dir="ltr">{bankDetails.iban || '—'}</span>{bankDetails.instructions && <><br />{bankDetails.instructions}</>}</div>}
        {authenticated && coinBalance > 0 && <div className={s.note}><strong>{t('Use loyalty coins')}</strong><span className={s.small}>{t('1 coin = 0.01 in store currency.')}</span><div className={s.code} style={{ marginTop: 8 }}><input className={s.input} type="number" min="0" max={coinBalance} step="1" inputMode="numeric" value={coinsToUse || ''} onChange={e => setCoinsToUse(Math.max(0, Math.min(coinBalance, Number(e.target.value) || 0)))} placeholder={t('Coins to use')} aria-label={t('Coins to use')} /><button className={s.codeBtn} type="button" onClick={() => setCoinsToUse(coinBalance)}>{t('Use all')}</button></div></div>}
        {giftOpen
          ? <label className={s.field}><span className={s.label}>{t('Gift card')}</span><input className={s.input} name="giftCardCode" autoCapitalize="characters" placeholder={t('Gift card code')} /><span className={s.help}>{t('Applied when you place the order.')}</span></label>
          : <button type="button" className={s.linkBtn} onClick={() => setGiftOpen(true)}>{t('Have a gift card?')}</button>}
        {settings?.selling?.giftOption !== false && <div className={s.giftBox}>
          <label className={s.check}><input type="checkbox" checked={isGift} onChange={e => setIsGift(e.target.checked)} /> <span><Gift size={16} aria-hidden="true" /> {t('This is a gift')}</span></label>
          {isGift && <label className="giftNote"><span className={s.label}>{t('Gift message (optional)')}</span><textarea value={giftMessage} onChange={e => setGiftMessage(e.target.value)} maxLength={300} rows={3} placeholder={t('We put your message in the parcel. Prices are not shown inside.')} dir="auto" /></label>}
        </div>}
      </section>

      {error && <div className={s.alert} role="alert" aria-live="polite">{error}</div>}
      <div className={s.placeBar}>
        <button className={s.placeBtn} type="submit" disabled={loading || !items.length || !settings || !sessionLoaded || enabledMethods.length === 0 || guestBlocked} aria-busy={loading}>
          <Lock size={18} />{loading ? t('Placing order…') : `${t('Place order')} · ${money(total)}`}
        </button>
        <div className={s.trust}><span><ShieldCheck size={14} /> {t('Your details are only used for this order')}</span>{settings?.payment.cod && <span><Banknote size={14} /> {t('Cash on delivery')}</span>}</div>
      </div>
      <Link className={s.back} href="/cart">{t('Back to cart')}</Link>
    </form>
  </div></main>
}
