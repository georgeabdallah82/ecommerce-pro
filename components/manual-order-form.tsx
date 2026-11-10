'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, Minus, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { money } from '@/lib/config'
import { internationalPhone } from '@/lib/phone'
import { MANUAL_ORDER_SOURCES, deliveryFee } from '@/lib/manual-order'
import s from './admin-new-order.module.css'
import ui from './admin-ui.module.css'
import { CountrySelect } from './field-selects'

// Admin > Orders > New order: for customers who order on WhatsApp, Instagram, by phone or in the
// shop. Phone first, top to bottom: where it came from, who, what, where to, how they pay.
// Only a name, a phone number, an address and one product are needed; email is optional.

export type PickVariant = { id: string; name: string; price: number; stock: number | null }
export type PickProduct = { id: string; name: string; sku: string; price: number; image: string; stock: number | null; variants: PickVariant[] }
type Customer = { id: string; name: string; email: string; phone?: string | null }
type Rate = { id: string | null; name: string; price: number; freeAbove: number | null }
type Line = { key: string; productId: string; variantId: string | null; name: string; price: number; quantity: number; stock: number | null }

const PAYMENTS = [
  { id: 'COD', label: 'Cash on delivery' },
  { id: 'BANK_TRANSFER', label: 'Money transfer (Whish, OMT, bank)' },
] as const

const cents = (value: string) => Math.max(0, Math.round((Number(value) || 0) * 100))
const stockNote = (stock: number | null) => stock === null ? '' : stock <= 0 ? 'Out of stock' : `${stock} left`
const matches = (text: string, query: string) => query.split(/\s+/).filter(Boolean).every(word => text.toLowerCase().includes(word.toLowerCase()))

export default function ManualOrderForm({ products, customers, rates, storeCountry }: { products: PickProduct[]; customers: Customer[]; rates: Rate[]; storeCountry: string }) {
  const router = useRouter()
  const [source, setSource] = useState<string>('whatsapp')

  // Customer
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const linked = customers.find(c => c.id === customerId)
  const customerResults = useMemo(() => customerQuery.trim().length < 2 ? [] : customers.filter(c => matches(`${c.name} ${c.phone || ''} ${c.email}`, customerQuery)).slice(0, 5), [customers, customerQuery])
  function chooseCustomer(c: Customer) { setCustomerId(c.id); setName(c.name || ''); setPhone(c.phone || ''); setEmail(c.email || ''); setCustomerQuery('') }
  const phoneLooksWrong = phone.trim().length >= 6 && !internationalPhone(phone, storeCountry)

  // Products
  const [productQuery, setProductQuery] = useState('')
  const [openProduct, setOpenProduct] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const productResults = useMemo(() => productQuery.trim() ? products.filter(p => matches(`${p.name} ${p.sku} ${p.variants.map(v => v.name).join(' ')}`, productQuery)).slice(0, 8) : [], [products, productQuery])
  function addItem(product: PickProduct, variant?: PickVariant) {
    const key = `${product.id}:${variant?.id || ''}`
    setLines(current => current.some(l => l.key === key)
      ? current.map(l => l.key === key ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l)
      : [...current, { key, productId: product.id, variantId: variant?.id || null, name: product.name + (variant ? ` — ${variant.name}` : ''), price: variant?.price ?? product.price, quantity: 1, stock: variant ? variant.stock : product.stock }])
    setOpenProduct(''); setProductQuery(''); setError('')
  }
  function pickProduct(product: PickProduct) {
    if (product.variants.length) setOpenProduct(openProduct === product.id ? '' : product.id)
    else addItem(product)
  }
  const setQuantity = (key: string, quantity: number) => setLines(current => current.map(l => l.key === key ? { ...l, quantity: Math.min(99, Math.max(1, quantity)) } : l))
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0)

  // Delivery
  const [city, setCity] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [country, setCountry] = useState(storeCountry)
  const [rateIndex, setRateIndex] = useState<number | 'free' | 'other'>(rates.length ? 0 : 'other')
  const [otherFee, setOtherFee] = useState('')
  const rate = typeof rateIndex === 'number' ? rates[rateIndex] : null
  const fee = rateIndex === 'free' ? 0 : rateIndex === 'other' ? cents(otherFee) : deliveryFee(rate, subtotal)
  const shippingMethod = rateIndex === 'free' ? 'Free delivery' : rateIndex === 'other' ? 'Delivery' : rate?.name || 'Delivery'

  // Payment and status
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [discount, setDiscount] = useState('')
  const [confirmed, setConfirmed] = useState(true)
  const [notes, setNotes] = useState('')
  const discountCents = Math.min(subtotal, cents(discount))
  const total = Math.max(0, subtotal - discountCents + fee)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const missing = [!name.trim() && 'the customer name', !phone.trim() && 'a phone number', !lines.length && 'a product', !city.trim() && 'the city or area', !line1.trim() && 'the address'].filter(Boolean) as string[]

  async function createOrder() {
    if (missing.length) { setError(`Still needed: ${missing.join(', ')}.`); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source, customerId: customerId || undefined, name: name.trim(), phone: phone.trim(), email: email.trim(),
          country: country.trim() || storeCountry, city: city.trim(), line1: line1.trim(), line2: line2.trim(),
          items: lines.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          discount: discountCents, shippingTotal: fee, taxTotal: 0, shippingMethod,
          paymentMethod, paymentStatus: paymentMethod !== 'COD' && alreadyPaid ? 'PAID' : 'UNPAID',
          confirmed, notes: notes.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not create the order')
      router.push(`/admin/orders/${data.order.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the order'); setSaving(false) }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link className={ui.textLink} href="/admin/orders"><ArrowLeft size={15}/> Orders</Link>
        <h1 className={s.title}>New order</h1>
        <p className={s.subtitle}>For customers who order on WhatsApp, Instagram, by phone or in the shop.</p>
      </header>

      <section className={s.card} aria-labelledby="no-source">
        <h2 id="no-source" className={s.cardTitle}>Where did the order come from?</h2>
        <div className={s.chips} role="radiogroup" aria-labelledby="no-source">
          {MANUAL_ORDER_SOURCES.map(x => <button key={x.id} type="button" role="radio" aria-checked={source === x.id} className={`${s.chip} ${source === x.id ? s.chipOn : ''}`} onClick={() => setSource(x.id)}>{x.label}</button>)}
        </div>
      </section>

      <section className={s.card} aria-labelledby="no-customer">
        <h2 id="no-customer" className={s.cardTitle}>Customer</h2>
        {linked
          ? <div className={s.linked}><UserRound size={16}/><span>Saved customer: <strong>{linked.name || linked.email}</strong></span><button type="button" className={s.iconBtn} aria-label="Remove saved customer" onClick={() => setCustomerId('')}><X size={16}/></button></div>
          : customers.length > 0 && <div className={s.searchWrap}>
              <label className={s.search}><Search size={16}/><input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Ordered before? Find them" aria-label="Search saved customers"/></label>
              {customerResults.length > 0 && <div className={s.results}>{customerResults.map(c => <button key={c.id} type="button" className={s.result} onClick={() => chooseCustomer(c)}><strong>{c.name || c.email}</strong><span>{[c.phone, c.email].filter(Boolean).join(' · ')}</span></button>)}</div>}
            </div>}
        <label className={s.field}><span>Name *</span><input className={ui.input} value={name} onChange={e => setName(e.target.value)} autoComplete="off" placeholder="Rana Haddad"/></label>
        <label className={s.field}><span>Phone (WhatsApp) *</span><input className={ui.input} type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="off" placeholder="70 123 456" dir="ltr"/>{phoneLooksWrong && <em className={s.warn}>This number looks incomplete. Check it so the driver can call.</em>}</label>
        <label className={s.field}><span>Email <i>(optional)</i></span><input className={ui.input} type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="Leave empty if they have none" dir="ltr"/>{email.trim() && <em className={s.help}>They will get the order confirmation by email.</em>}</label>
      </section>

      <section className={s.card} aria-labelledby="no-products">
        <h2 id="no-products" className={s.cardTitle}>Products</h2>
        <div className={s.searchWrap}>
          <label className={s.search}><Search size={16}/><input value={productQuery} onChange={e => { setProductQuery(e.target.value); setOpenProduct('') }} placeholder="Search products to add" aria-label="Search products"/>{productQuery && <button type="button" className={s.iconBtn} aria-label="Clear search" onClick={() => setProductQuery('')}><X size={16}/></button>}</label>
          {productQuery.trim() !== '' && <div className={s.results}>
            {productResults.length === 0 && <p className={s.none}>No product matches “{productQuery.trim()}”.</p>}
            {productResults.map(p => (
              <div key={p.id}>
                <button type="button" className={s.product} onClick={() => pickProduct(p)} aria-expanded={p.variants.length ? openProduct === p.id : undefined}>
                  <span className={s.thumb}>{p.image ? <img src={p.image} alt="" loading="lazy"/> : null}</span>
                  <span className={s.productText}><strong>{p.name}</strong><span>{p.variants.length ? `${p.variants.length} options` : money(p.price)}{stockNote(p.variants.length ? null : p.stock) && ` · ${stockNote(p.stock)}`}</span></span>
                  <span className={s.addTag}>{p.variants.length ? 'Choose' : <><Plus size={14}/> Add</>}</span>
                </button>
                {openProduct === p.id && <div className={s.variants}>{p.variants.map(v => <button key={v.id} type="button" className={s.chip} onClick={() => addItem(p, v)}>{v.name} · {money(v.price)}{v.stock !== null && v.stock <= 0 ? ' · out of stock' : ''}</button>)}</div>}
              </div>
            ))}
          </div>}
        </div>
        {lines.length === 0
          ? <p className={s.none}>No products yet. Search above and tap one to add it.</p>
          : <ul className={s.lines}>{lines.map(l => (
              <li key={l.key} className={s.line}>
                <div className={s.lineText}><strong>{l.name}</strong><span>{money(l.price)} each{l.stock !== null && l.quantity > l.stock ? <em className={s.warn}> · only {Math.max(0, l.stock)} in stock</em> : null}</span></div>
                <div className={s.stepper}>
                  <button type="button" aria-label={`One less ${l.name}`} onClick={() => l.quantity > 1 ? setQuantity(l.key, l.quantity - 1) : setLines(lines.filter(x => x.key !== l.key))}>{l.quantity > 1 ? <Minus size={15}/> : <Trash2 size={15}/>}</button>
                  <span aria-label="Quantity">{l.quantity}</span>
                  <button type="button" aria-label={`One more ${l.name}`} onClick={() => setQuantity(l.key, l.quantity + 1)}><Plus size={15}/></button>
                </div>
                <strong className={s.lineTotal}>{money(l.price * l.quantity)}</strong>
              </li>
            ))}</ul>}
      </section>

      <section className={s.card} aria-labelledby="no-delivery">
        <h2 id="no-delivery" className={s.cardTitle}>Delivery</h2>
        <label className={s.field}><span>City / area *</span><input className={ui.input} value={city} onChange={e => setCity(e.target.value)} placeholder="Beirut, Hamra"/></label>
        <label className={s.field}><span>Address *</span><input className={ui.input} value={line1} onChange={e => setLine1(e.target.value)} placeholder="Street, building"/></label>
        <label className={s.field}><span>Floor, landmark <i>(optional)</i></span><input className={ui.input} value={line2} onChange={e => setLine2(e.target.value)} placeholder="3rd floor, near the pharmacy"/></label>
        <label className={s.field}><span>Country</span><CountrySelect className={ui.select} value={country} onChange={setCountry}/></label>
        <div className={s.field}><span>Delivery fee</span>
          <div className={s.chips} role="radiogroup" aria-label="Delivery fee">
            {rates.map((r, i) => <button key={r.id || i} type="button" role="radio" aria-checked={rateIndex === i} className={`${s.chip} ${rateIndex === i ? s.chipOn : ''}`} onClick={() => setRateIndex(i)}>{r.name} · {money(deliveryFee(r, subtotal))}</button>)}
            <button type="button" role="radio" aria-checked={rateIndex === 'free'} className={`${s.chip} ${rateIndex === 'free' ? s.chipOn : ''}`} onClick={() => setRateIndex('free')}>Free</button>
            <button type="button" role="radio" aria-checked={rateIndex === 'other'} className={`${s.chip} ${rateIndex === 'other' ? s.chipOn : ''}`} onClick={() => setRateIndex('other')}>Other amount</button>
          </div>
          {rateIndex === 'other' && <input className={`${ui.input} ${s.money}`} type="number" inputMode="decimal" min="0" step="0.01" value={otherFee} onChange={e => setOtherFee(e.target.value)} placeholder="0.00" aria-label="Delivery fee amount"/>}
          {rate && rate.freeAbove !== null && fee === 0 && subtotal > 0 && <em className={s.help}>Free: the order is over {money(rate.freeAbove)}.</em>}
        </div>
      </section>

      <section className={s.card} aria-labelledby="no-payment">
        <h2 id="no-payment" className={s.cardTitle}>Payment</h2>
        <div className={s.chips} role="radiogroup" aria-labelledby="no-payment">
          {PAYMENTS.map(p => <button key={p.id} type="button" role="radio" aria-checked={paymentMethod === p.id} className={`${s.chip} ${paymentMethod === p.id ? s.chipOn : ''}`} onClick={() => setPaymentMethod(p.id)}>{p.label}</button>)}
        </div>
        {paymentMethod !== 'COD' && <label className={s.check}><input type="checkbox" checked={alreadyPaid} onChange={e => setAlreadyPaid(e.target.checked)}/><span><strong>Money already received</strong><em>Tick only once the transfer has arrived.</em></span></label>}
        <label className={s.field}><span>Discount <i>(optional)</i></span><input className={`${ui.input} ${s.money}`} type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00"/></label>
      </section>

      <section className={s.card} aria-labelledby="no-final">
        <h2 id="no-final" className={s.cardTitle}>Before you save</h2>
        <label className={s.check}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span><strong>The customer already confirmed</strong><em>{confirmed ? 'The order starts as Confirmed, ready to prepare.' : 'The order starts as New, so you can send the WhatsApp confirmation first.'}</em></span></label>
        <label className={s.field}><span>Note for the team <i>(optional, the customer never sees it)</i></span><textarea className={ui.textarea} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Wants delivery after 5 pm"/></label>
      </section>

      <section className={`${s.card} ${s.summary}`} aria-label="Order total">
        <div><span>Products</span><strong>{money(subtotal)}</strong></div>
        {discountCents > 0 && <div><span>Discount</span><strong>− {money(discountCents)}</strong></div>}
        <div><span>Delivery</span><strong>{money(fee)}</strong></div>
        <div className={s.grand}><span>{paymentMethod === 'COD' ? 'Driver collects' : 'Total'}</span><strong>{money(total)}</strong></div>
      </section>

      {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
      <div className={s.saveBar}>
        <div className={s.saveTotal}><span>Total</span><strong>{money(total)}</strong></div>
        <button type="button" className={`${ui.btn} ${s.saveBtn}`} disabled={saving} onClick={createOrder}>{saving ? 'Creating…' : <><Check size={17}/> Create order</>}</button>
      </div>
    </div>
  )
}
