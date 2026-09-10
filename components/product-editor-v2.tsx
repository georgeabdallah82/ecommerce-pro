'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Eye, Plus, Save, Trash2, X } from 'lucide-react'
import s from './admin-product-editor.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'

type ImageItem = { id?: string; url: string; alt?: string | null }
type Variant = { id?: string; name: string; sku: string; barcode?: string | null; optionJson: string; price?: number | null; compareAtPrice?: number | null; quantity?: number; lowStockThreshold?: number; location?: string; weight?: number | null; weightUnit?: string | null; inventory?: any[] }
type Product = {
  id?: string; name: string; slug: string; description?: string | null; shortDescription?: string | null
  brand?: string | null; vendor?: string | null; productType?: string | null
  basePrice: number; compareAtPrice?: number | null; costPrice?: number | null
  sku: string; barcode?: string | null; status: string; featured: boolean
  seoTitle?: string | null; seoDescription?: string | null; seoImageUrl?: string | null
  weight?: number | null; weightUnit?: string | null
  requiresShipping: boolean; taxable: boolean; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; giftCard: boolean
  productTemplate?: string | null; categoryId?: string | null; publishedAt?: string | null
  images: ImageItem[]; variants: Variant[]; inventory: any[]; tags: any[]; metafields?: any[]
  sharedInventory?: boolean; quantity?: number; lowStockThreshold?: number; location?: string
}

const tabs = ['General', 'Inventory', 'Variants', 'Shipping', 'Metafields', 'Search & SEO'] as const

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}
function moneyValue(cents: number | null | undefined) { return cents == null ? '' : (cents / 100).toFixed(2) }
function parseOptions(v: Variant) { try { const x = JSON.parse(v.optionJson || '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} } }
function combos(names: string[], values: string[][]) {
  const active = names.map((name, i) => ({ name: name.trim(), values: (values[i] || []).map(v => v.trim()).filter(Boolean) })).filter(x => x.name && x.values.length)
  if (!active.length) return []
  return active.reduce<{ name: string; options: Record<string, string> }[]>(
    (acc, opt) => acc.flatMap(row => opt.values.map(value => ({ name: row.name ? `${row.name} / ${value}` : value, options: { ...row.options, [opt.name]: value } }))),
    [{ name: '', options: {} }],
  )
}

export default function ProductEditorV2({ initial, creating, categories, definitions }: { initial: Product; creating: boolean; categories: any[]; definitions: any[] }) {
  const [product, setProduct] = useState<Product>(initial)
  const [tab, setTab] = useState<typeof tabs[number]>('General')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  const initialNames = (() => {
    const set = new Set<string>()
    ;(initial.variants || []).forEach(v => Object.keys(parseOptions(v)).forEach(k => set.add(k)))
    const r = Array.from(set).slice(0, 3)
    return r.length ? r : ['']
  })()
  const [optionNames, setOptionNames] = useState<string[]>(initialNames)
  const [optionValues, setOptionValues] = useState<string[][]>(() => initialNames.map(n => Array.from(new Set((initial.variants || []).map(v => String(parseOptions(v)[n] || '')).filter(Boolean)))))

  const available = useMemo(
    () => product.quantity !== undefined ? Number(product.quantity) : (product.inventory || []).filter((x: any) => !x.variantId).reduce((s: number, x: any) => s + Number(x.quantity || 0) - Number(x.reserved || 0), 0),
    [product.quantity, product.inventory],
  )
  function variantStock(v: Variant) { return v.quantity !== undefined ? Number(v.quantity) : (v.inventory || []).reduce((s: number, x: any) => s + Number(x.quantity || 0) - Number(x.reserved || 0), 0) }
  const inventoryTotal = product.sharedInventory ? available : (product.variants || []).reduce((s, v) => s + variantStock(v), 0)

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function update(p: Partial<Product>) { setProduct(x => ({ ...x, ...p })); setDirty(true); setMessage('') }
  function updateVariant(i: number, p: Partial<Variant>) { update({ variants: product.variants.map((v, n) => n === i ? { ...v, ...p } : v) }) }

  async function save() {
    if (!product.name.trim()) { setError('Title is required'); setTab('General'); return }
    if (!product.sku.trim()) { setError('SKU is required'); setTab('Inventory'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const payload = {
        ...product,
        basePrice: Math.round(Number(product.basePrice) || 0),
        compareAtPrice: product.compareAtPrice == null ? null : Math.round(Number(product.compareAtPrice)),
        costPrice: product.costPrice == null ? null : Math.round(Number(product.costPrice)),
        tags: (product.tags || []).map((x: any) => typeof x === 'string' ? x : x.value),
      }
      const data = creating ? await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }) : await api(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      setProduct(data.product); setDirty(false); setMessage('Saved')
      if (creating) window.location.href = `/admin/products/${data.product.id}`
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  async function duplicate() {
    if (!product.id) return
    setBusy(true); setError('')
    try {
      const data = await api(`/api/admin/products/${product.id}/duplicate`, { method: 'POST' })
      window.location.href = `/admin/products/${data.product.id}`
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to duplicate') } finally { setBusy(false) }
  }

  async function deleteProduct() {
    if (!product.id) return
    if (!confirm(`Permanently delete "${product.name || 'this product'}"? This cannot be undone.`)) return
    setBusy(true); setError('')
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' })
      window.location.href = '/admin/products'
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete product'); setBusy(false) }
  }

  function generateVariants() {
    const c = combos(optionNames, optionValues)
    if (!c.length) { setError('Add an option name and values first'); return }
    const old = new Map(product.variants.map(v => [JSON.stringify(parseOptions(v)), v]))
    const next = c.map((x, i) => old.get(JSON.stringify(x.options)) || ({ name: x.name, sku: `${product.sku}-${i + 1}`, barcode: null, optionJson: JSON.stringify(x.options), price: product.basePrice, compareAtPrice: product.compareAtPrice, quantity: 0, lowStockThreshold: 5, location: 'Main' } as Variant))
    update({ variants: next })
    setMessage(`${next.length} variants ready to save`)
  }

  function moveImage(i: number, d: -1 | 1) {
    const a = [...product.images]; const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    update({ images: a })
  }

  return <div className={s.page}>
    <div className={s.topbar}>
      <div className={s.topLeft}>
        <Link href="/admin/products" className={ui.iconBtn} onClick={e => { if (dirty && !confirm('Discard unsaved changes?')) e.preventDefault() }}><ArrowLeft size={18} /></Link>
        <div><div className={`${ui.muted} ${ui.tiny}`}>PRODUCT</div><h1 className={s.title}>{creating ? 'Add product' : product.name || 'Untitled product'}</h1>{dirty && <div className={`${ui.muted} ${ui.tiny}`}>Unsaved changes</div>}</div>
      </div>
      <div className={s.topActions}>
        <Link className={`${ui.btn} ${ui.btnSecondary} ${s.topActionBtn}`} href={creating ? '/admin/products' : `/product/${product.slug}`} target="_blank"><Eye size={16} /> Preview</Link>
        {!creating && <button className={`${ui.btn} ${ui.btnSecondary} ${s.topActionBtn}`} onClick={duplicate} disabled={busy}><Copy size={16} /> Duplicate</button>}
        <button className={`${ui.btn} ${s.topActionBtn}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : <><Save size={16} /> Save</>}</button>
      </div>
    </div>

    {(error || message) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} style={{ margin: '0 0 14px' }}>{error || message}</div>}

    <div className={s.tabs}>{tabs.map(t => <button key={t} className={tab === t ? s.active : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

    <div className={s.body}>
      <main className={s.main}>
        {tab === 'General' && <>
          <Card title="Title & description" sub="Storefront-facing product content">
            <Field label="Title"><input className={ui.input} value={product.name} onChange={e => update({ name: e.target.value })} /></Field>
            <Field label="Short description"><textarea className={ui.textarea} rows={4} value={product.shortDescription || ''} onChange={e => update({ shortDescription: e.target.value })} /></Field>
            <Field label="Description"><textarea className={ui.textarea} rows={12} value={product.description || ''} onChange={e => update({ description: e.target.value })} /></Field>
          </Card>

          <Card title="Media" sub="Reorder, upload, or choose from your media library">
            <div className={s.mediaGrid}>
              {(product.images || []).map((im, i) => <div className={s.mediaItem} key={im.id || i}>
                {im.url ? <img src={im.url} alt={im.alt || ''} /> : <div className={s.mediaPlaceholder}>No image</div>}
                <div className={s.mediaControls}>
                  {i === 0 && <span className={s.pill}>Main image</span>}
                  <input className={ui.input} placeholder="Alt text" value={im.alt || ''} onChange={e => update({ images: product.images.map((x, n) => n === i ? { ...x, alt: e.target.value } : x) })} />
                  <div className="inline">
                    <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => moveImage(i, -1)} disabled={i === 0}>↑</button>
                    <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => moveImage(i, 1)} disabled={i === product.images.length - 1}>↓</button>
                    <button className={`${ui.textButton} ${ui.textButtonDanger}`} onClick={() => update({ images: product.images.filter((_, n) => n !== i) })}><Trash2 size={14} /> Remove</button>
                  </div>
                </div>
              </div>)}
              <button className={s.mediaAdd} onClick={() => setMediaPickerOpen(true)}><Plus size={18} /> Add media</button>
            </div>
          </Card>

          <Card title="Organization" sub="Catalog structure and publishing">
            <div className={s.twoCol}>
              <Field label="Vendor / brand"><input className={ui.input} value={product.vendor || product.brand || ''} onChange={e => update({ vendor: e.target.value, brand: e.target.value })} /></Field>
              <Field label="Product type"><input className={ui.input} value={product.productType || ''} onChange={e => update({ productType: e.target.value })} /></Field>
              <Field label="Category"><select className={ui.select} value={product.categoryId || ''} onChange={e => update({ categoryId: e.target.value || null })}><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}</select></Field>
              <Field label="Status"><select className={ui.select} value={product.status} onChange={e => update({ status: e.target.value, publishedAt: e.target.value === 'ACTIVE' ? new Date().toISOString() : null })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></Field>
            </div>
            <Field label="Tags">
              <div className={s.tagRow}>
                {(product.tags || []).map((t: any, i: number) => <span className={s.tagChip} key={i}>{typeof t === 'string' ? t : t.value}<button onClick={() => update({ tags: product.tags.filter((_, n) => n !== i) })}>×</button></span>)}
                <input className={`${ui.input} ${s.tagRowField}`} placeholder="Add tag and press Enter" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) update({ tags: [...(product.tags || []), { value: v }] }); e.currentTarget.value = '' } }} />
              </div>
            </Field>
          </Card>

          <Card title="Pricing" sub="Price, compare-at and cost">
            <div className={s.threeCol}>
              <MoneyField label="Price" value={product.basePrice} onChange={v => update({ basePrice: v || 0 })} />
              <MoneyField label="Compare-at price" value={product.compareAtPrice} onChange={v => update({ compareAtPrice: v })} />
              <MoneyField label="Cost per item" value={product.costPrice} onChange={v => update({ costPrice: v })} />
            </div>
            <div className={s.pricingPreview}><span>Margin</span><strong>{product.costPrice && product.basePrice ? `${Math.max(0, Math.round((1 - product.costPrice / product.basePrice) * 100))}%` : '—'}</strong></div>
          </Card>
        </>}

        {tab === 'Inventory' && <>
          <Card title="Inventory" sub="Stock tracking and identifiers">
            <div className={s.threeCol}>
              <Field label="SKU"><input className={ui.input} value={product.sku} onChange={e => update({ sku: e.target.value })} /></Field>
              <Field label="Barcode"><input className={ui.input} value={product.barcode || ''} onChange={e => update({ barcode: e.target.value })} /></Field>
              <Field label="Low stock at"><input className={ui.input} type="number" value={product.lowStockThreshold || 5} onChange={e => update({ lowStockThreshold: Number(e.target.value) })} /></Field>
            </div>
            <div className={s.checkGrid}>
              <Check checked={product.trackInventory} onChange={v => update({ trackInventory: v })} title="Track inventory" text="Prevent overselling when stock is exhausted." />
              <Check checked={product.continueSellingWhenOutOfStock} onChange={v => update({ continueSellingWhenOutOfStock: v })} title="Continue selling when out of stock" text="Allow checkout at zero available inventory." />
            </div>
            <div className={s.notice}><strong>{product.sharedInventory ? 'Shared inventory pool' : product.variants.length ? 'Variant inventory' : 'Product inventory'}</strong><span>{inventoryTotal} units represented by the current inventory mode.</span></div>
          </Card>
          {(!product.variants.length || product.sharedInventory) && <Card title="Product inventory" sub="Used for non-variant stock or a shared variant pool">
            <div className={s.threeCol}>
              <Field label="Available"><input className={ui.input} type="number" value={available} onChange={e => update({ quantity: Number(e.target.value) })} /></Field>
              <Field label="Location"><input className={ui.input} value={product.location || product.inventory?.[0]?.location || 'Main'} onChange={e => update({ location: e.target.value })} /></Field>
              <Field label="Low stock"><input className={ui.input} type="number" value={product.lowStockThreshold || product.inventory?.[0]?.lowStockThreshold || 5} onChange={e => update({ lowStockThreshold: Number(e.target.value) })} /></Field>
            </div>
          </Card>}
        </>}

        {tab === 'Variants' && <>
          <Card title="Options" sub="Up to three option dimensions">
            <div className={s.optionList}>
              {optionNames.map((n, i) => <div className={s.optionRow} key={i}>
                <input className={ui.input} placeholder={`Option ${i + 1} name`} value={n} onChange={e => { const a = [...optionNames]; a[i] = e.target.value; setOptionNames(a); setDirty(true) }} />
                <input className={ui.input} placeholder="Values separated by commas" value={(optionValues[i] || []).join(', ')} onChange={e => { const a = [...optionValues]; a[i] = e.target.value.split(',').map(x => x.trim()).filter(Boolean); setOptionValues(a); setDirty(true) }} />
                {optionNames.length > 1 && <button className={ui.iconBtn} onClick={() => { setOptionNames(optionNames.filter((_, x) => x !== i)); setOptionValues(optionValues.filter((_, x) => x !== i)); setDirty(true) }}><X size={15} /></button>}
              </div>)}
            </div>
            <div className="inline">
              <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { if (optionNames.length < 3) { setOptionNames(x => [...x, '']); setOptionValues(x => [...x, []]); setDirty(true) } }} disabled={optionNames.length >= 3}><Plus size={15} /> Add option</button>
              <button className={ui.btn} onClick={generateVariants}><Plus size={15} /> Generate variants</button>
            </div>
          </Card>
          <Card title="Inventory mode" sub="Variant stock or one shared product pool">
            <Check checked={Boolean(product.sharedInventory)} onChange={v => update({ sharedInventory: v })} title="Shared inventory pool" text="All variants use the same product-level available quantity." />
          </Card>
          <Card title="Variants" sub={`${product.variants.length} variants`}>
            <div className={s.variantHead}><span>Variant</span><span>SKU</span><span>Price</span><span>Stock</span><span></span></div>
            {product.variants.map((v, i) => <div className={s.variantRow} key={v.id || i}>
              <input className={`${ui.input} ${s.variantField}`} value={v.name} onChange={e => updateVariant(i, { name: e.target.value })} />
              <input className={`${ui.input} ${s.variantField}`} value={v.sku} onChange={e => updateVariant(i, { sku: e.target.value })} />
              <input className={`${ui.input} ${s.variantField}`} value={moneyValue(v.price)} onChange={e => updateVariant(i, { price: Math.round(Number(e.target.value || 0) * 100) })} />
              <input className={`${ui.input} ${s.variantField}`} type="number" value={variantStock(v)} disabled={Boolean(product.sharedInventory)} onChange={e => updateVariant(i, { quantity: Number(e.target.value) })} />
              <button className={`${ui.iconBtn} ${s.variantDeleteBtn}`} onClick={() => update({ variants: product.variants.filter((_, n) => n !== i) })}><Trash2 size={16} /></button>
            </div>)}
            {!product.variants.length && <div className={s.emptyInline}>No variants yet.</div>}
          </Card>
        </>}

        {tab === 'Shipping' && <Card title="Shipping & tax" sub="Fulfillment behavior">
          <div className={s.checkGrid}>
            <Check checked={product.requiresShipping} onChange={v => update({ requiresShipping: v })} title="Physical product" text="Collect shipping details." />
            <Check checked={product.taxable} onChange={v => update({ taxable: v })} title="Charge tax" text="Use store tax rules." />
            <Check checked={product.giftCard} onChange={v => update({ giftCard: v })} title="Gift card" text="Reserved for gift-card product types." />
          </div>
          <div className={s.threeCol}>
            <Field label="Weight"><input className={ui.input} type="number" step="0.01" value={product.weight ?? ''} onChange={e => update({ weight: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Weight unit"><select className={ui.select} value={product.weightUnit || 'kg'} onChange={e => update({ weightUnit: e.target.value })}><option>kg</option><option>g</option><option>lb</option><option>oz</option></select></Field>
            <Field label="Template"><select className={ui.select} value={product.productTemplate || 'product'} onChange={e => update({ productTemplate: e.target.value })}><option value="product">Default product</option><option value="product.featured">Featured product</option><option value="product.minimal">Minimal product</option></select></Field>
          </div>
        </Card>}

        {tab === 'Metafields' && <Card title="Metafields" sub="Structured custom data">
          {definitions.length ? definitions.map((d: any) => {
            const cur = product.metafields?.find((m: any) => m.definitionId === d.id)?.value || ''
            return <Field key={d.id} label={d.name}>
              <span className={ui.fieldHelp}>{d.namespace}.{d.key} · {d.type}</span>
              <input className={ui.input} value={cur} onChange={e => { const n = [...(product.metafields || [])].filter((m: any) => m.definitionId !== d.id); if (e.target.value) n.push({ definitionId: d.id, value: e.target.value }); update({ metafields: n }) }} />
            </Field>
          }) : <div className={s.emptyInline}>No metafield definitions yet.</div>}
        </Card>}

        {tab === 'Search & SEO' && <Card title="Search engine listing" sub="SEO title, description and URL handle">
          <Field label="URL handle"><input className={ui.input} value={product.slug} onChange={e => update({ slug: e.target.value })} /></Field>
          <Field label="SEO title"><input className={ui.input} value={product.seoTitle || ''} onChange={e => update({ seoTitle: e.target.value })} /></Field>
          <Field label="SEO description"><textarea className={ui.textarea} rows={5} value={product.seoDescription || ''} onChange={e => update({ seoDescription: e.target.value })} /></Field>
          <Field label="SEO image URL"><input className={ui.input} value={product.seoImageUrl || ''} onChange={e => update({ seoImageUrl: e.target.value })} /></Field>
          <div className={s.notice} style={{ display: 'block' }}><strong>{product.seoTitle || product.name}</strong><span style={{ display: 'block', marginTop: 4 }}>/product/{product.slug || 'product-handle'}</span><span style={{ display: 'block', marginTop: 4 }}>{product.seoDescription || product.shortDescription || 'Add an SEO description.'}</span></div>
        </Card>}
      </main>

      <aside className={s.rail}>
        <Card title="Status" sub="Publishing"><span className={s.pill}>{product.status}</span></Card>
        <Card title="Summary" sub="Catalog facts">
          <div className={s.summaryLine}><span>SKU</span><strong>{product.sku}</strong></div>
          <div className={s.summaryLine}><span>Variants</span><strong>{product.variants.length}</strong></div>
          <div className={s.summaryLine}><span>Inventory</span><strong>{inventoryTotal}</strong></div>
          <div className={s.summaryLine}><span>Featured</span><strong>{product.featured ? 'Yes' : 'No'}</strong></div>
        </Card>
        {!creating && <Card title="Danger zone" sub="Irreversible actions">
          <button className={s.dangerButton} onClick={deleteProduct} disabled={busy}><Trash2 size={15} /> Delete product</button>
        </Card>}
      </aside>
    </div>

    <MediaPicker open={mediaPickerOpen} onClose={() => setMediaPickerOpen(false)} onAdd={images => update({ images: [...(product.images || []), ...images] })} />
  </div>

  function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return <section className={s.card}><div className={s.cardHead}><h3>{title}</h3>{sub && <p>{sub}</p>}</div><div className={s.cardBody}>{children}</div></section>
  }
  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className={s.field}>{label}{children}</label>
  }
  function MoneyField({ label, value, onChange }: { label: string; value?: number | null; onChange: (v: number | null) => void }) {
    return <Field label={label}><div className={s.moneyInput}><span>$</span><input value={moneyValue(value)} onChange={e => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value || 0) * 100))} /></div></Field>
  }
  function Check({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
    return <label className={s.checkCard}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span><strong>{title}</strong><small>{text}</small></span></label>
  }
}
