'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { money } from '@/lib/config'
import styles from './admin-draft-orders.module.css'
import s from './admin-order-detail.module.css'
import ui from './admin-ui.module.css'

type Product = { id: string; name: string; sku: string; basePrice: number; variants?: { id: string; name: string; sku: string; price: number | null }[] }
type Customer = { id: string; name: string; email: string; phone?: string | null }
type Line = { productId: string; variantId: string | null; name: string; sku: string; quantity: number; unitPrice: number }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function DraftOrderForm({ products, customers }: { products: Product[]; customers: Customer[] }) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  const [discount, setDiscount] = useState('')
  const [shipping, setShipping] = useState('')
  const [tax, setTax] = useState('')
  const [notes, setNotes] = useState('')

  const [country, setCountry] = useState('')
  const [line1, setLine1] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [postalCode, setPostalCode] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const product = products.find(p => p.id === productId)
  const variants = product?.variants || []
  const selectedVariant = variants.find(v => v.id === variantId)
  const defaultUnitPrice = selectedVariant?.price ?? product?.basePrice ?? 0

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0), [lines])
  const discountValue = Math.max(0, Number(discount) || 0) * 100
  const shippingValue = Math.max(0, Number(shipping) || 0) * 100
  const taxValue = Math.max(0, Number(tax) || 0) * 100
  const total = Math.max(0, subtotal - discountValue + shippingValue + taxValue)

  function pickCustomer(id: string) {
    setCustomerId(id)
    const c = customers.find(x => x.id === id)
    if (c) { setEmail(c.email); setPhone(c.phone || '') }
  }

  function addLine() {
    if (!product) { setError('Select a product'); return }
    const q = Math.min(999, Math.max(1, Math.floor(qty)))
    const unitPrice = price.trim() ? Math.round(Number(price) * 100) : defaultUnitPrice
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { setError('Enter a valid price'); return }
    const existing = lines.find(l => l.productId === product.id && l.variantId === (selectedVariant?.id || null))
    if (existing) setLines(lines.map(l => l === existing ? { ...l, quantity: Math.min(999, l.quantity + q) } : l))
    else setLines([...lines, { productId: product.id, variantId: selectedVariant?.id || null, name: product.name + (selectedVariant ? ` — ${selectedVariant.name}` : ''), sku: selectedVariant?.sku || product.sku, quantity: q, unitPrice }])
    setQty(1); setPrice(''); setError('')
  }

  async function createDraft() {
    if (!email.trim()) { setError('Customer email is required'); return }
    if (!lines.length) { setError('Add at least one item'); return }
    setSaving(true); setError('')
    try {
      const shippingAddress = (line1 || city || country) ? { line1, city, region, postalCode, country } : undefined
      const data = await api('/api/admin/draft-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          items: lines.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
          discountTotal: discountValue,
          shippingTotal: shippingValue,
          taxTotal: taxValue,
          shippingAddress,
          notes: notes.trim() || undefined,
        }),
      })
      router.push(`/admin/draft-orders/${data.draftOrder.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create draft order'); setSaving(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><Link className={ui.textLink} href="/admin/draft-orders">← Back to draft orders</Link><span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>COMMERCE</span><h1 className={ui.heading}>New draft order</h1><p className={ui.muted}>Build an order for a customer before it reserves stock or gets billed.</p></div>
      <button className={ui.btn} disabled={saving || !lines.length} onClick={createDraft}>{saving ? 'Creating…' : 'Create draft order'}</button>
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className={s.grid}>
      <main className={s.main}>
        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Customer</h3></div>
          <label className={ui.fieldLabel}>Existing customer<select className={ui.select} value={customerId} onChange={e => pickCustomer(e.target.value)}><option value="">Guest / manual customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select></label>
          <div className={ui.twoCol}>
            <label className={ui.fieldLabel}>Email<input className={ui.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" /></label>
            <label className={ui.fieldLabel}>Phone<input className={ui.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+961 ..." /></label>
          </div>
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Items</h3></div>
          <div className={styles.pickerRow}>
            <label className={ui.fieldLabel}>Product<select className={ui.select} value={productId} onChange={e => { setProductId(e.target.value); setVariantId(''); setPrice('') }}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.basePrice)}</option>)}</select></label>
            <label className={ui.fieldLabel}>Variant<select className={ui.select} value={variantId} disabled={!variants.length} onChange={e => setVariantId(e.target.value)}><option value="">Default / shared stock</option>{variants.map(v => <option key={v.id} value={v.id}>{v.name} — {money(v.price ?? product?.basePrice ?? 0)}</option>)}</select></label>
            <label className={ui.fieldLabel} style={{ maxWidth: 120 }}>Qty<input className={ui.input} type="number" min="1" max="999" value={qty} onChange={e => setQty(Number(e.target.value) || 1)} /></label>
            <label className={ui.fieldLabel} style={{ maxWidth: 140 }}>Price<input className={ui.input} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder={(defaultUnitPrice / 100).toFixed(2)} /></label>
          </div>
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addLine} disabled={!productId}>Add item</button>
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${styles.lineTable}`}>
              <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th></th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={`${l.productId}:${l.variantId || ''}`}>
                <td><strong>{l.name}</strong></td>
                <td>{l.sku}</td>
                <td><input className={ui.inputCompact} style={{ width: 80 }} type="number" min="1" max="999" value={l.quantity} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Math.min(999, Math.max(1, Number(e.target.value) || 1)) } : x))} /></td>
                <td>{money(l.unitPrice * l.quantity)}</td>
                <td><button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          {!lines.length && <p className={ui.muted}>No items added yet.</p>}
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Shipping address</h3><span className={ui.muted}>Optional — can be added later</span></div>
          <div className={ui.twoCol}><label className={ui.fieldLabel}>Country<input className={ui.input} value={country} onChange={e => setCountry(e.target.value)} /></label><label className={ui.fieldLabel}>City<input className={ui.input} value={city} onChange={e => setCity(e.target.value)} /></label></div>
          <label className={ui.fieldLabel}>Address<input className={ui.input} value={line1} onChange={e => setLine1(e.target.value)} placeholder="Street, building, apartment…" /></label>
          <div className={ui.twoCol}><label className={ui.fieldLabel}>Region<input className={ui.input} value={region} onChange={e => setRegion(e.target.value)} /></label><label className={ui.fieldLabel}>Postal code<input className={ui.input} value={postalCode} onChange={e => setPostalCode(e.target.value)} /></label></div>
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Totals & notes</h3></div>
          <div className={ui.twoCol}><label className={ui.fieldLabel}>Discount<input className={ui.input} type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} /></label><label className={ui.fieldLabel}>Shipping<input className={ui.input} type="number" min="0" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} /></label></div>
          <label className={ui.fieldLabel}>Tax<input className={ui.input} type="number" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)} /></label>
          <label className={ui.fieldLabel}>Internal note<textarea className={ui.textarea} rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note for staff…" /></label>
        </section>
      </main>

      <aside className={s.rail}>
        <section className={ui.card}>
          <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order summary</h3></div>
          <div className={s.summaryLine}><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div className={s.summaryLine}><span>Discount</span><strong>- {money(discountValue)}</strong></div>
          <div className={s.summaryLine}><span>Shipping</span><strong>{money(shippingValue)}</strong></div>
          <div className={s.summaryLine}><span>Tax</span><strong>{money(taxValue)}</strong></div>
          <div className={`${s.summaryLine} ${s.summaryLineTotal}`}><span>Total</span><strong>{money(total)}</strong></div>
          <button className={`${ui.btn} ${ui.btnWide}`} disabled={saving || !lines.length} onClick={createDraft}>{saving ? 'Creating…' : 'Create draft order'}</button>
        </section>
      </aside>
    </div>
  </div>
}
