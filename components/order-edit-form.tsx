'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { money } from '@/lib/config'
import s from './admin-order-detail.module.css'
import ui from './admin-ui.module.css'

type Variant = { id: string; name: string; sku: string; price: number | null }
type Product = { id: string; name: string; sku: string; basePrice: number; variants?: Variant[] }
type Line = { orderItemId: string | null; productId: string; variantId: string | null; name: string; sku: string; quantity: number; unitPrice: number }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

export default function OrderEditForm({ order, products }: { order: any; products: Product[] }) {
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>(
    (order.items || []).map((i: any) => ({ orderItemId: i.id, productId: i.productId, variantId: i.variantId, name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice })),
  )
  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const product = products.find(p => p.id === productId)
  const variants = product?.variants || []
  const selectedVariant = variants.find(v => v.id === variantId)
  const unitPrice = selectedVariant?.price ?? product?.basePrice ?? 0

  const subtotalAfter = useMemo(() => lines.reduce((sum, l) => sum + Math.max(0, l.quantity) * Math.max(0, l.unitPrice), 0), [lines])
  const deltaTotal = subtotalAfter - order.subtotal

  function updateLine(index: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLine() {
    if (!product) return setError('Select a product to add')
    const existing = lines.find(l => !l.orderItemId && l.productId === product.id && l.variantId === (selectedVariant?.id || null))
    if (existing) {
      setLines(prev => prev.map(l => (l === existing ? { ...l, quantity: l.quantity + qty } : l)))
    } else {
      setLines(prev => [...prev, { orderItemId: null, productId: product.id, variantId: selectedVariant?.id || null, name: product.name + (selectedVariant ? ` — ${selectedVariant.name}` : ''), sku: selectedVariant?.sku || product.sku, quantity: qty, unitPrice }])
    }
    setProductId(''); setVariantId(''); setQty(1); setError('')
  }

  function removeNewLine(index: number) {
    setLines(prev => prev.filter((_, i) => i !== index))
  }

  async function submit() {
    setSaving(true); setError('')
    try {
      const payload = {
        orderId: order.id,
        reason: reason.trim() || undefined,
        items: lines.map(l => ({ orderItemId: l.orderItemId || undefined, productId: l.productId, variantId: l.variantId, quantity: Math.max(0, Math.trunc(l.quantity)), unitPrice: Math.max(0, Math.trunc(l.unitPrice)), totalPrice: Math.max(0, Math.trunc(l.quantity)) * Math.max(0, Math.trunc(l.unitPrice)) })),
      }
      const d = await api('/api/admin/order-edits', { method: 'POST', body: JSON.stringify(payload) })
      router.push(`/admin/order-edits/${d.orderEdit.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create order edit')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className={ui.sectionHead}>
        <div>
          <Link className={ui.textLink} href={`/admin/orders/${order.id}`}>← Back to order</Link>
          <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>ORDER EDIT</span>
          <h1 className={ui.title}>Edit order #{order.orderNumber}</h1>
          <p className={ui.muted}>Adjust quantities, pricing or add new items. Nothing changes until this edit is applied.</p>
        </div>
        <div className="inline">
          <span className={ui.pill}>Draft</span>
          <button className={ui.btn} disabled={saving || !lines.length} onClick={submit}>{saving ? 'Creating…' : 'Create order edit'}</button>
        </div>
      </div>

      {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

      <div className={s.grid}>
        <main className={s.main}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Line items</h3><span className={ui.muted}>Set quantity to 0 to remove an existing item</span></div>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={`${l.orderItemId || 'new'}:${l.productId}:${l.variantId || ''}:${i}`}>
                      <td><strong>{l.name}</strong>{!l.orderItemId && <span className={ui.muted} style={{ marginLeft: 6, fontSize: 11 }}>(new)</span>}</td>
                      <td className={ui.muted}>{l.sku}</td>
                      <td><input className={ui.inputCompact} style={{ width: 72 }} type="number" min="0" max="99" value={l.quantity} onChange={e => updateLine(i, { quantity: Math.min(99, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                      <td><input className={ui.inputCompact} style={{ width: 100 }} type="number" min="0" step="0.01" value={(l.unitPrice / 100).toFixed(2)} onChange={e => updateLine(i, { unitPrice: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })} /></td>
                      <td>{money(l.quantity * l.unitPrice, order.currency)}</td>
                      <td>{!l.orderItemId && <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => removeNewLine(i)}><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lines.length && <p className={ui.muted}>No line items — add at least one to create an order edit.</p>}

            <div className={ui.twoCol} style={{ marginTop: 18 }}>
              <label className={ui.fieldLabel}>Add product<select className={ui.select} value={productId} onChange={e => { setProductId(e.target.value); setVariantId('') }}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.basePrice)}</option>)}</select></label>
              <label className={ui.fieldLabel}>Variant<select className={ui.select} value={variantId} disabled={!variants.length} onChange={e => setVariantId(e.target.value)}><option value="">Default / shared stock</option>{variants.map(v => <option key={v.id} value={v.id}>{v.name} — {money(v.price ?? product?.basePrice ?? 0)}</option>)}</select></label>
            </div>
            <div className="inline" style={{ alignItems: 'end' }}>
              <label className={ui.fieldLabel} style={{ maxWidth: 140 }}>Qty<input className={ui.input} type="number" min="1" max="99" value={qty} onChange={e => setQty(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addLine}><Plus size={15} /> Add item</button>
            </div>
          </section>

          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Reason</h3></div>
            <textarea className={ui.textarea} rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional note explaining why this order is being edited…" />
          </section>
        </main>

        <aside className={s.rail}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order summary</h3></div>
            <div className={s.summaryLine}><span>Current subtotal</span><strong>{money(order.subtotal, order.currency)}</strong></div>
            <div className={s.summaryLine}><span>New subtotal</span><strong>{money(subtotalAfter, order.currency)}</strong></div>
            <div className={`${s.summaryLine} ${s.summaryLineTotal}`}><span>Change</span><strong>{deltaTotal > 0 ? '+' : ''}{money(deltaTotal, order.currency)}</strong></div>
            <button className={`${ui.btn} ${ui.btnWide}`} disabled={saving || !lines.length} onClick={submit} style={{ marginTop: 14 }}>{saving ? 'Creating…' : 'Create order edit'}</button>
            <p className={ui.muted} style={{ marginTop: 10, fontSize: 12 }}>Creating this edit does not change the order — you'll apply it from the order edit detail page.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
