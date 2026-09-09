'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { money, config } from '@/lib/config'

type Variant = { id: string; name: string; sku: string }
type Product = { id: string; name: string; sku: string; costPrice: number | null; basePrice: number; variants?: Variant[] }
type Location = { id: string; name: string; isDefault: boolean }
type Line = { productId: string; variantId: string | null; name: string; sku: string; quantityOrdered: number; unitCost: number }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

export default function PurchaseOrderForm({ products, locations }: { products: Product[]; locations: Location[] }) {
  const router = useRouter()
  const [supplierName, setSupplierName] = useState('')
  const [locationId, setLocationId] = useState(locations.find(l => l.isDefault)?.id || '')
  const [currency, setCurrency] = useState(config.currency)
  const [notes, setNotes] = useState('')
  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const product = products.find(p => p.id === productId)
  const variants = product?.variants || []
  const unitCost = product?.costPrice ?? 0

  const totalCost = useMemo(() => lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0), [lines])

  function addLine() {
    if (!product) return setError('Select a product')
    const variant = variants.find(v => v.id === variantId)
    const q = Math.min(9999, Math.max(1, Math.floor(qty)))
    const existing = lines.find(l => l.productId === product.id && l.variantId === (variant?.id || null))
    if (existing) setLines(prev => prev.map(l => (l === existing ? { ...l, quantityOrdered: l.quantityOrdered + q } : l)))
    else setLines(prev => [...prev, { productId: product.id, variantId: variant?.id || null, name: product.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku || product.sku, quantityOrdered: q, unitCost }])
    setQty(1); setError('')
  }

  async function create() {
    if (!lines.length) return setError('Add at least one line item')
    setSaving(true); setError('')
    try {
      const d = await api('/api/admin/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierName: supplierName || undefined,
          locationId: locationId || undefined,
          currency,
          notes: notes || undefined,
          items: lines.map(l => ({ productId: l.productId, variantId: l.variantId, quantityOrdered: l.quantityOrdered, unitCost: l.unitCost })),
        }),
      })
      router.push(`/admin/purchase-orders/${d.purchaseOrder.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create purchase order'); setSaving(false) }
  }

  return (
    <div className="section">
      <div className="container">
        <div className="sectionHead">
          <div>
            <Link className="textLink" href="/admin/purchase-orders">← Back to purchase orders</Link>
            <span className="muted tiny" style={{ display: 'block', marginTop: 12 }}>INVENTORY</span>
            <h1 className="h2">New purchase order</h1>
            <p className="muted">Order stock from a supplier and receive it into a location.</p>
          </div>
          <div className="inline"><span className="pill">Draft</span><button className="btn" disabled={saving || !lines.length} onClick={create}>{saving ? 'Creating…' : 'Create purchase order'}</button></div>
        </div>

        {error && <div className="alert danger">{error}</div>}

        <div className="orderDetailGrid">
          <main className="orderDetailMain">
            <section className="card adminPanel" style={{ padding: 20 }}>
              <div className="sectionHead small"><h3>Supplier & location</h3></div>
              <div className="twoColFields">
                <label className="fieldLabel">Supplier name<input className="input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier or vendor name" /></label>
                <label className="fieldLabel">Receiving location<select className="input" value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Unassigned</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.isDefault ? ' (default)' : ''}</option>)}</select></label>
              </div>
              <label className="fieldLabel">Currency<input className="input" style={{ maxWidth: 140 }} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></label>
            </section>

            <section className="card adminPanel" style={{ padding: 20 }}>
              <div className="sectionHead small"><h3>Items</h3></div>
              <div className="twoColFields">
                <label className="fieldLabel">Product<select className="input" value={productId} onChange={e => { setProductId(e.target.value); setVariantId('') }}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}</select></label>
                <label className="fieldLabel">Variant<select className="input" value={variantId} disabled={!variants.length} onChange={e => setVariantId(e.target.value)}><option value="">Default / shared stock</option>{variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
              </div>
              <div className="inline" style={{ alignItems: 'end' }}>
                <label className="fieldLabel" style={{ maxWidth: 140 }}>Qty<input className="input" type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value) || 1)} /></label>
                <button className="btn secondary" onClick={addLine}><Plus size={15} /> Add item</button>
              </div>
              <div className="tableWrap" style={{ marginTop: 14 }}>
                <table className="table">
                  <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit cost</th><th>Total</th><th /></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.productId}:${l.variantId || ''}`}>
                        <td><strong>{l.name}</strong></td>
                        <td className="muted">{l.sku}</td>
                        <td><input className="input compact" style={{ width: 80 }} type="number" min="1" value={l.quantityOrdered} onChange={e => setLines(prev => prev.map((x, j) => (j === i ? { ...x, quantityOrdered: Math.max(1, Number(e.target.value) || 1) } : x)))} /></td>
                        <td><input className="input compact" style={{ width: 100 }} type="number" min="0" step="0.01" value={(l.unitCost / 100).toFixed(2)} onChange={e => setLines(prev => prev.map((x, j) => (j === i ? { ...x, unitCost: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) } : x)))} /></td>
                        <td>{money(l.quantityOrdered * l.unitCost, currency)}</td>
                        <td><button className="btn ghost smallBtn" onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!lines.length && <p className="muted" style={{ marginTop: 10 }}>No items added yet.</p>}
            </section>

            <section className="card adminPanel" style={{ padding: 20 }}>
              <div className="sectionHead small"><h3>Notes</h3></div>
              <textarea className="textarea" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note for this purchase order…" />
            </section>
          </main>

          <aside className="orderDetailRail">
            <section className="card adminPanel" style={{ padding: 20 }}>
              <div className="sectionHead small"><h3>Summary</h3></div>
              <div className="summaryLine"><span>Items</span><strong>{lines.length}</strong></div>
              <div className="summaryLine total"><span>Total cost</span><strong>{money(totalCost, currency)}</strong></div>
              <button className="btn wide" disabled={saving || !lines.length} onClick={create} style={{ marginTop: 14 }}>{saving ? 'Creating…' : 'Create purchase order'}</button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
