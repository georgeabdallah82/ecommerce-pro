'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Copy, Eye, Plus, Trash2, X } from 'lucide-react'
import s from './admin-product-editor.module.css'
import ui from './admin-ui.module.css'
import MediaPicker from './media-picker'
import UnsavedBar from './admin-unsaved-bar'
import { useConfirm } from './admin-confirm'
import { MoneyInput, NumInput } from './num-input'
import { ReadinessStrip } from './admin-readiness'
import RichTextEditor from './rich-text-editor'
import StockByLocation, { type StockRow } from './stock-by-location'
import { descriptionHtml } from '@/lib/sanitize-html'
import { describeVariantPlan, planVariants, stockOf } from '@/lib/variant-plan'
import { priceProblem, productReadiness } from '@/lib/editor-readiness'
import { channelsShowing, parseOptionValues, pricingSummary, tagsFromInput } from '@/lib/product-editor'
import { money } from '@/lib/config'
import { allowLeave, useLeaveGuard } from './use-leave-guard'
import { fetchRead } from '@/lib/retry-fetch'

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' }
const STATUS_CLASS: Record<string, string> = { ACTIVE: 'statusPillSuccess', DRAFT: 'statusPillWarning', ARCHIVED: 'statusPillDanger' }

type ImageItem = { id?: string; url: string; alt?: string | null }
type Variant = { id?: string; name: string; sku: string; barcode?: string | null; optionJson: string; price?: number | null; compareAtPrice?: number | null; quantity?: number; lowStockThreshold?: number; locationId?: string | null; weight?: number | null; weightUnit?: string | null; inventory?: any[] }
type StoreLocationOption = { id: string; name: string; isDefault?: boolean }
type Product = {
  id?: string; name: string; slug: string; description?: string | null; shortDescription?: string | null; sizeGuide?: string | null
  brand?: string | null; vendor?: string | null; productType?: string | null
  basePrice: number; compareAtPrice?: number | null; costPrice?: number | null
  sku: string; barcode?: string | null; status: string; featured: boolean
  seoTitle?: string | null; seoDescription?: string | null; seoImageUrl?: string | null
  weight?: number | null; weightUnit?: string | null
  requiresShipping: boolean; taxable: boolean; trackInventory: boolean; continueSellingWhenOutOfStock: boolean; giftCard: boolean
  preorder?: boolean; preorderNote?: string | null
  refillDays?: number | null
  videoUrl?: string | null
  productTemplate?: string | null; publishedAt?: string | null
  images: ImageItem[]; variants: Variant[]; inventory: any[]; tags: any[]; metafields?: any[]
  sharedInventory?: boolean; quantity?: number; lowStockThreshold?: number; locationId?: string | null
  collections?: { collectionId: string }[]
}
type CollectionOption = { id: string; name: string; isActive?: boolean }

const tabs = ['General', 'Inventory', 'Variants', 'Shipping', 'Channels', 'Metafields', 'Search & SEO'] as const

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}
function parseOptions(v: Variant) { try { const x = JSON.parse(v.optionJson || '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} } }
// The option names, each option's values (as the text in its box) and the collections of a product as saved.
function optionNamesOf(p: Product) {
  const set = new Set<string>()
  ;(p.variants || []).forEach(v => Object.keys(parseOptions(v)).forEach(k => set.add(k)))
  const names = Array.from(set).slice(0, 3)
  return names.length ? names : ['']
}
function optionTextOf(p: Product, names: string[]) {
  return names.map(n => Array.from(new Set((p.variants || []).map(v => String(parseOptions(v)[n] || '')).filter(Boolean))).join(', '))
}
function collectionIdsOf(p: Product) { return (p.collections || []).map(c => c.collectionId) }
// Defined at module scope, not inside ProductEditorV2: a component declared inside another
// component's body is a new function on every render, so React treats each render's <Card>/
// <Field>/etc as a different component type and remounts its whole subtree -- every field in
// this editor (title, price, SKU, variants, SEO...) lost focus, and with it the on-screen
// keyboard, after a single keystroke.
// Cards are h2s under the page's h1 (they were h3s, a level skipped).
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <section className={s.card}><div className={s.cardHead}><h2>{title}</h2>{sub && <p>{sub}</p>}</div><div className={s.cardBody}>{children}</div></section>
}
// A <label> around its one control. A field holding buttons too (tags, collections) or help text uses a
// <label htmlFor> instead: a wrapping label names its first control, which there was a tag's remove button.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={s.field}>{label}{children}</label>
}
// The "$" is decoration (the field was named "Price$"); the box shows focus like every other field.
function MoneyField({ label, value, onChange, id }: { label: string; value?: number | null; onChange: (v: number | null) => void; id?: string }) {
  return <Field label={label}><div className={s.moneyInput}><span aria-hidden="true">$</span><MoneyInput id={id} className={s.moneyField} cents={value} onCents={onChange} placeholder="0.00" /></div></Field>
}
function Check({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return <label className={s.checkCard}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span><strong>{title}</strong><small>{text}</small></span></label>
}

// Search-and-tick list of collections, with the chosen ones shown as removable chips.
// The list stays open while focus is anywhere in the picker, so Tab (or the Down arrow) reaches its tick boxes;
// it closed 150 ms after the search box lost focus, taking the box Tab had just moved to with it. Up and Down move
// through the list (Down opens it again after Escape), Escape closes it and goes back to the search box.
function CollectionPicker({ id, options, value, onChange }: { id: string; options: CollectionOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // Set while Escape puts focus back on the search box, so that focus doesn't open the list again.
  const quiet = useRef(false)
  const chosen = value.map(id => options.find(o => o.id === id)).filter(Boolean) as CollectionOption[]
  const q = query.trim().toLowerCase()
  const matches = options.filter(o => !q || o.name.toLowerCase().includes(q)).slice(0, 60)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false)
      if (document.activeElement !== search.current) { quiet.current = true; search.current?.focus() }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (!open) { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } return }
    const boxes = [...(wrap.current?.querySelectorAll<HTMLInputElement>(`#${id}-list input[type="checkbox"]`) || [])]
    if (!boxes.length) return
    event.preventDefault()
    const at = boxes.indexOf(document.activeElement as HTMLInputElement)
    if (at < 0) { if (event.key === 'ArrowDown') boxes[0].focus(); return }
    const next = at + (event.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) search.current?.focus()
    else boxes[Math.min(next, boxes.length - 1)].focus()
  }
  if (!options.length) return <p className={ui.muted} style={{ margin: 0 }}>No collections yet. <Link href="/admin/collections" className="textLink">Create one</Link> first.</p>
  return <div className={s.collectionPicker} ref={wrap} onKeyDown={onKeyDown} onBlur={event => { if (!wrap.current?.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    {chosen.length > 0 && <div className={s.tagRow}>{chosen.map(c => <span className={s.tagChip} key={c.id}>{c.name}<button type="button" aria-label={`Remove from ${c.name}`} onClick={() => toggle(c.id)}>×</button></span>)}</div>}
    <input id={id} ref={search} className={ui.input} placeholder={chosen.length ? 'Add to another collection…' : 'Search collections…'} value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => { if (quiet.current) quiet.current = false; else setOpen(true) }} onClick={() => setOpen(true)} />
    {open && <div id={`${id}-list`} className={s.collectionMenu} role="group" aria-label="Collections to choose from" onMouseDown={e => e.preventDefault()}>
      {matches.length ? matches.map(o => <label key={o.id} className={s.collectionOption}>
        <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
        <span>{o.name}</span>{o.isActive === false && <small>hidden</small>}
      </label>) : <div className={s.collectionEmpty}>No collection matches &ldquo;{query}&rdquo;</div>}
    </div>}
  </div>
}

export default function ProductEditorV2({ initial, creating, definitions, locations, channels, publications, collections = [], waitingCount = 0 }: { initial: Product; creating: boolean; definitions: any[]; locations?: StoreLocationOption[]; channels?: any[]; publications?: any[]; collections?: CollectionOption[]; waitingCount?: number }) {
  const confirm = useConfirm()
  const [product, setProduct] = useState<Product>(initial)
  const [tab, setTab] = useState<typeof tabs[number]>('General')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Why the last save failed, said in the unsaved-changes bar: it stays in view where Save was pressed, while the
  // message at the top of the page was out of sight further down.
  const [saveError, setSaveError] = useState('')
  const [dirty, setDirty] = useState(false)
  // The product as last saved. Discard goes back to it: it went back to the page as first loaded, so after a save
  // it showed the old values again, and the next save wrote them back.
  const [saved, setSaved] = useState<Product>(initial)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [productPublications, setProductPublications] = useState<any[]>(publications || [])
  const [seoMediaPickerOpen, setSeoMediaPickerOpen] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // Bumped on discard so the description editor shows the saved text again.
  const [editorKey, setEditorKey] = useState(0)
  const [collectionIds, setCollectionIds] = useState<string[]>(() => collectionIdsOf(initial))

  const [optionNames, setOptionNames] = useState<string[]>(() => optionNamesOf(initial))
  // Each option's values box keeps exactly what was typed ("S, M, L"); parseOptionValues reads it.
  const [optionText, setOptionText] = useState<string[]>(() => optionTextOf(initial, optionNamesOf(initial)))
  const optionValues = useMemo(() => optionText.map(parseOptionValues), [optionText])

  const available = useMemo(
    () => product.quantity !== undefined ? Number(product.quantity) : (product.inventory || []).filter((x: any) => !x.variantId).reduce((s: number, x: any) => s + Number(x.quantity || 0) - Number(x.reserved || 0), 0),
    [product.quantity, product.inventory],
  )
  function variantStock(v: Variant) { return stockOf(v) }
  const inventoryTotal = product.sharedInventory ? available : (product.variants || []).reduce((s, v) => s + variantStock(v), 0)
  // This editor can only ever show/write one blended quantity per product or variant -- safe
  // when stock lives at zero or one location, but a real split across 2+ locations (from a
  // Purchase Order or Inventory Transfer) can't be represented by a single number without
  // losing which location holds what. Rather than silently overwriting an arbitrary location's
  // row with the blended total on save, those fields go read-only and point at the Inventory
  // page, which already edits stock per location correctly.
  const productLocationSplit = (initial.inventory || []).filter((x: any) => !x.variantId).length > 1
  function variantLocationSplit(v: Variant) { return (v.inventory || []).length > 1 }

  const stockRows: StockRow[] = [
    ...(product.inventory || []).filter((x: any) => !x.variantId).map((x: any) => ({ id: x.id, item: 'Product', location: x.location?.name || 'No location', quantity: Number(x.quantity || 0), reserved: Number(x.reserved || 0) })),
    ...product.variants.flatMap(v => (v.inventory || []).map((x: any) => ({ id: x.id, item: v.name || 'Variant', location: x.location?.name || 'No location', quantity: Number(x.quantity || 0), reserved: Number(x.reserved || 0) }))),
  ]
  async function saveStock(row: StockRow, target: number) {
    const r = await fetch('/api/admin/inventory', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id, delta: target - row.quantity, reason: 'Adjusted from the product page' }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Unable to save stock')
    const quantity = Number(d.item?.quantity ?? target)
    const patch = (x: any) => (x.id === row.id ? { ...x, quantity, reserved: Number(d.item?.reserved ?? x.reserved ?? 0) } : x)
    setProduct(p => ({ ...p, inventory: (p.inventory || []).map(patch), variants: p.variants.map(v => ({ ...v, inventory: (v.inventory || []).map(patch) })) }))
    setMessage(`${row.item} at ${row.location} now has ${quantity} in stock.`)
  }

  const readiness = useMemo(() => productReadiness({
    name: product.name || '', sku: product.sku || '', basePrice: Number(product.basePrice) || 0, compareAtPrice: product.compareAtPrice,
    description: product.description, shortDescription: product.shortDescription, status: product.status, images: product.images || [],
    seoTitle: product.seoTitle, seoDescription: product.seoDescription, collectionCount: collectionIds.length,
    // A product is on every active channel unless it was taken off one, as the Channels tab and the store read it.
    // Counting only "available" rows warned "not on any sales channel yet" on every product never changed there.
    // A new product goes on every channel once saved.
    publishedChannels: creating ? 1 : channelsShowing(channels || [], productPublications).length,
  }), [product, collectionIds, productPublications, channels, creating])

  // Asks before leaving with unsaved changes: admin links, Back, reload (components/use-leave-guard.ts).
  useLeaveGuard(dirty)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!busy && (dirty || creating)) void save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // save() reads the current product, so the listener follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, busy, creating, product, collectionIds, optionNames, optionValues])

  function update(p: Partial<Product>) { setProduct(x => ({ ...x, ...p })); setDirty(true); setMessage('') }
  function updateVariant(i: number, p: Partial<Variant>) { update({ variants: product.variants.map((v, n) => n === i ? { ...v, ...p } : v) }) }

  // The product video (lib/product-video.ts): uploaded on its own, then saved with the product.
  async function uploadVideo(file: File | undefined) {
    if (!file) return
    setVideoError('')
    if (file.size > 25 * 1024 * 1024) { setVideoError('That video is larger than 25 MB. Please choose a shorter or smaller one.'); return }
    setVideoBusy(true)
    try {
      const body = new FormData(); body.set('file', file)
      const r = await fetch('/api/admin/media/video', { method: 'POST', body })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to upload the video')
      update({ videoUrl: d.url })
    } catch (e) { setVideoError(e instanceof Error ? e.message : 'Unable to upload the video') } finally { setVideoBusy(false) }
  }

  // A save problem: said in the bar, with the tab holding the field opened and the field focused.
  function saveProblem(problem: string, where: typeof tabs[number], field: string) {
    setSaveError(problem); setTab(where)
    requestAnimationFrame(() => document.getElementById(field)?.focus())
  }

  async function save() {
    if (!product.name.trim()) return saveProblem('Title is required', 'General', 'product-title')
    if (!product.sku.trim()) return saveProblem('SKU is required', 'Inventory', 'product-sku')
    const pricing = priceProblem(product.basePrice, product.compareAtPrice)
    if (pricing) return saveProblem(pricing, 'General', 'product-compare-at')
    setBusy(true); setSaveError(''); setError(''); setMessage('')
    try {
      const payload = {
        ...product,
        basePrice: Math.round(Number(product.basePrice) || 0),
        compareAtPrice: product.compareAtPrice == null ? null : Math.round(Number(product.compareAtPrice)),
        costPrice: product.costPrice == null ? null : Math.round(Number(product.costPrice)),
        tags: (product.tags || []).map((x: any) => typeof x === 'string' ? x : x.value),
        collectionIds,
      }
      const data = creating ? await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }) : await api(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      setProduct(data.product); setSaved(data.product); setDirty(false); setMessage('Saved')
      // Saved: open the new product's page without the leave warning.
      if (creating) { allowLeave(); window.location.href = `/admin/products/${data.product.id}` }
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  function discard() {
    setProduct(saved)
    setCollectionIds(collectionIdsOf(saved))
    const names = optionNamesOf(saved)
    setOptionNames(names)
    setOptionText(optionTextOf(saved, names))
    setEditorKey(k => k + 1)
    setDirty(false); setSaveError(''); setError(''); setMessage('')
  }

  // The copy is made from the product as saved, and opening it leaves this page. With unsaved changes it asks
  // first: it used to make the copy, then the browser asked about leaving, and staying kept a copy nobody opened.
  async function duplicate() {
    if (!product.id) return
    if (dirty && !(await confirm({ title: 'Duplicate without your changes?', message: "The copy is made from this product as last saved. Your unsaved changes here are lost when the copy opens.", confirmLabel: 'Duplicate saved version', cancelLabel: 'Keep editing' }))) return
    setBusy(true); setError('')
    try {
      const data = await api(`/api/admin/products/${product.id}/duplicate`, { method: 'POST' })
      allowLeave()
      window.location.href = `/admin/products/${data.product.id}`
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to duplicate') } finally { setBusy(false) }
  }

  async function deleteProduct() {
    if (!product.id) return
    if (!(await confirm({ title: `Delete "${product.name || 'this product'}"?`, message: 'The product is permanently removed. This cannot be undone.', confirmLabel: 'Delete product' }))) return
    setBusy(true); setError('')
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' })
      allowLeave()
      window.location.href = '/admin/products'
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete product'); setBusy(false) }
  }

  // The plan (what is kept, added and removed) is worked out first, so the removals can be
  // confirmed before any stock records go.
  async function generateVariants() {
    const plan = planVariants(product.variants, optionNames, optionValues, product.sku || '', (combo, sku) => ({ name: combo.name, sku, barcode: null, optionJson: JSON.stringify(combo.options), price: product.basePrice, compareAtPrice: product.compareAtPrice, quantity: 0, lowStockThreshold: 5, locationId: product.locationId ?? null }) as Variant)
    if (!plan.next.length) { setError('Add an option name and values first'); return }
    if (plan.removed.length) {
      const stock = plan.removed.reduce((sum, v) => sum + variantStock(v), 0)
      const names = plan.removed.map(v => v.name || v.sku).join(', ')
      const ok = await confirm({ title: `Remove ${plan.removed.length} ${plan.removed.length === 1 ? 'variant' : 'variants'}?`, message: `${names} will be removed when you save${stock ? `, with ${stock} units in stock` : ''}. Removed variants lose their stock records.`, confirmLabel: 'Remove variants' })
      if (!ok) return
    }
    setError('')
    update({ variants: plan.next })
    setMessage(`Ready to save: ${describeVariantPlan(plan)}.`)
  }

  async function togglePublication(channelId: string, available: boolean) {
    if (!product.id) return
    setError('')
    try {
      const data = await api('/api/admin/sales-channels/publications', { method: 'POST', body: JSON.stringify({ productId: product.id, channelId, available }) })
      setProductPublications(prev => [...prev.filter((p: any) => p.channelId !== channelId), data.publication])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update channel availability') }
  }

  function moveImageTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= product.images.length || to >= product.images.length) return
    const a = [...product.images]
    const [item] = a.splice(from, 1)
    a.splice(to, 0, item)
    update({ images: a })
  }

  function moveImage(i: number, d: -1 | 1) {
    const a = [...product.images]; const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    update({ images: a })
  }

  // The section tabs: the arrow keys, Home and End move between them (the tabs pattern); Tab goes on into the section.
  function onTabKey(event: React.KeyboardEvent) {
    const at = tabs.indexOf(tab)
    const to = event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowLeft' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (to === null) return
    event.preventDefault()
    const next = (to + tabs.length) % tabs.length
    setTab(tabs[next])
    document.getElementById(`product-tab-${next}`)?.focus()
  }

  const pricing = pricingSummary(product.basePrice, product.costPrice)
  const tagName = (t: any) => String(typeof t === 'string' ? t : t?.value || '')

  return <div className={s.page}>
    <div className={s.topbar}>
      <div className={s.topLeft}>
        <Link href="/admin/products" aria-label="Back to products" className={ui.iconBtn}><ArrowLeft size={18} /></Link>
        <div><div className={`${ui.muted} ${ui.tiny}`}>PRODUCT</div><h1 className={s.title}>{creating ? 'Add product' : product.name || 'Untitled product'}</h1>{!creating && <span className={ui.statusPill + ' ' + ui[STATUS_CLASS[product.status] || 'statusPillWarning'] + ' ' + s.statusChip}>{STATUS_LABEL[product.status] || product.status}</span>}</div>
      </div>
      <div className={s.topActions}>
        {creating
          ? <span className={`${ui.btn} ${ui.btnSecondary} ${s.topActionBtn}`} aria-disabled="true" title="Save the product first to preview it" style={{ opacity: .5, cursor: 'not-allowed' }}><Eye size={16} /> Preview</span>
          : <Link className={`${ui.btn} ${ui.btnSecondary} ${s.topActionBtn}`} href={`/product/${product.slug}`} target="_blank"><Eye size={16} /> Preview</Link>}
        {!creating && <button className={`${ui.btn} ${ui.btnSecondary} ${s.topActionBtn}`} onClick={duplicate} disabled={busy}><Copy size={16} /> Duplicate</button>}
        {creating && <button className={`${ui.btn} ${s.topActionBtn}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </div>

    {(error || message) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role={error ? 'alert' : 'status'} style={{ margin: '0 0 14px' }}>{error || message}</div>}

    <ReadinessStrip title={creating ? 'Before you save' : 'Ready to sell'} checks={readiness} onGo={t => setTab(t as typeof tabs[number])} />

    {/* The unsaved-changes bar and the section tabs stay in view together, just below the app's top bar. The title
        bar above scrolls away: it stuck at the very top, under the app's top bar, and covered the bar and the tabs. */}
    <div className={s.stickyBand}>
      <UnsavedBar dirty={dirty || !!saveError} saving={busy} onDiscard={discard} onSave={save} error={saveError} label={creating ? 'Unsaved product' : undefined} />
      <div className={s.tabs} role="tablist" aria-label="Product sections" onKeyDown={onTabKey}>
        {tabs.map((t, i) => <button key={t} type="button" role="tab" id={`product-tab-${i}`} aria-selected={tab === t} aria-controls="product-panel" tabIndex={tab === t ? 0 : -1} className={tab === t ? s.active : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
    </div>

    <div className={s.body}>
      {/* Not a <main>: the admin layout's <main> already holds the page. */}
      <div className={s.main} role="tabpanel" id="product-panel" aria-labelledby={`product-tab-${tabs.indexOf(tab)}`}>
        {tab === 'General' && <>
          <Card title="Title & description" sub="Storefront-facing product content">
            <Field label="Title"><input id="product-title" className={ui.input} value={product.name} onChange={e => update({ name: e.target.value })} /></Field>
            <Field label="Short description"><textarea className={ui.textarea} rows={4} value={product.shortDescription || ''} onChange={e => update({ shortDescription: e.target.value })} /></Field>
            <div className={s.field}>
              <label htmlFor="product-size-guide">Size guide (optional)</label>
              <textarea id="product-size-guide" aria-describedby="product-size-guide-help" className={ui.textarea} rows={5} placeholder={'Size | Chest (cm) | Length (cm)\nS | 88-92 | 68\nM | 96-100 | 70'} value={product.sizeGuide || ''} onChange={e => update({ sizeGuide: e.target.value })} />
              <span id="product-size-guide-help" className={ui.muted} style={{ fontSize: 12 }}>First line: the column names. Then one size per line, cells separated by |. Shown under the description.</span>
            </div>
            <div className={s.field}><span>Description</span><RichTextEditor value={descriptionHtml(product.description)} resetKey={editorKey} minHeight={280} label="Description" onChange={html => update({ description: html })} /></div>
          </Card>

          <Card title="Media" sub="Reorder, upload, or choose from your media library">
            <div className={s.mediaGrid}>
              {(product.images || []).map((im, i) => <div className={s.mediaItem} key={im.id || i} role="group" aria-label={`Image ${i + 1}`} draggable onDragStart={() => setDragIndex(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragIndex !== null) moveImageTo(dragIndex, i); setDragIndex(null) }} onDragEnd={() => setDragIndex(null)}>
                {im.url ? <img src={im.url} alt={im.alt || ''} /> : <div className={s.mediaPlaceholder}>No image</div>}
                <div className={s.mediaControls}>
                  {i === 0 && <span className={s.pill}>Main image</span>}
                  {i > 0 && <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => moveImageTo(i, 0)}>Make main</button>}
                  <input className={ui.input} placeholder="Alt text" aria-label="Alt text" value={im.alt || ''} onChange={e => update({ images: product.images.map((x, n) => n === i ? { ...x, alt: e.target.value } : x) })} />
                  <div className="inline">
                    <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} aria-label="Move earlier" onClick={() => moveImage(i, -1)} disabled={i === 0}><span aria-hidden="true">↑</span></button>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} aria-label="Move later" onClick={() => moveImage(i, 1)} disabled={i === product.images.length - 1}><span aria-hidden="true">↓</span></button>
                    <button type="button" className={`${ui.textButton} ${ui.textButtonDanger}`} onClick={() => update({ images: product.images.filter((_, n) => n !== i) })}><Trash2 size={14} /> Remove</button>
                  </div>
                </div>
              </div>)}
              <button className={s.mediaAdd} onClick={() => setMediaPickerOpen(true)}><Plus size={18} /> Add media</button>
            </div>
            <div className={s.videoBox}>
              <strong>Product video <span className={ui.muted}>(optional)</span></strong>
              <p className={ui.muted}>A short clip shown on the product page, like an Instagram reel. MP4 or WebM, up to 25 MB. Save the product after adding it.</p>
              {product.videoUrl && <video className={s.videoPreview} src={product.videoUrl} controls playsInline preload="metadata" aria-label="Product video preview" />}
              {videoError && <p className={s.videoError} role="alert">{videoError}</p>}
              <div className="inline">
                <input id="product-video-file" className={s.videoFile} type="file" accept="video/mp4,video/webm" disabled={videoBusy} onChange={e => { uploadVideo(e.target.files?.[0]); e.target.value = '' }} />
                <label htmlFor="product-video-file" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`}>{videoBusy ? 'Uploading…' : product.videoUrl ? 'Replace video' : 'Upload a video'}</label>
                {product.videoUrl && !videoBusy && <button type="button" className={`${ui.textButton} ${ui.textButtonDanger}`} onClick={() => update({ videoUrl: null })}><Trash2 size={14} /> Remove video</button>}
              </div>
            </div>
          </Card>

          <Card title="Organization" sub="Catalog structure and publishing">
            <div className={s.twoCol}>
              <Field label="Vendor / brand"><input className={ui.input} value={product.vendor || product.brand || ''} onChange={e => update({ vendor: e.target.value, brand: e.target.value })} /></Field>
              <Field label="Product type"><input className={ui.input} value={product.productType || ''} onChange={e => update({ productType: e.target.value })} /></Field>
              <Field label="Status"><select className={ui.select} value={product.status} onChange={e => update({ status: e.target.value, publishedAt: e.target.value === 'ACTIVE' ? new Date().toISOString() : null })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></Field>
            </div>
            <Check checked={product.featured} onChange={v => update({ featured: v })} title="Featured" text="Comes first on the home page and among the suggestions in the cart and on product pages." />
            {/* Not <Field>s: a wrapping <label> names its first control, and these hold remove buttons and tick boxes. */}
            <div className={s.field}>
              {collections.length ? <label htmlFor="product-collections">Collections</label> : <span>Collections</span>}
              <CollectionPicker id="product-collections" options={collections} value={collectionIds} onChange={ids => { setCollectionIds(ids); setDirty(true); setMessage('') }} />
            </div>
            <div className={s.field}>
              <label htmlFor="product-tags">Tags</label>
              <div className={s.tagRow}>
                {(product.tags || []).map((t: any, i: number) => <span className={s.tagChip} key={i}>{tagName(t)}<button type="button" aria-label={`Remove tag ${tagName(t)}`} onClick={() => update({ tags: product.tags.filter((_, n) => n !== i) })}>×</button></span>)}
                <input id="product-tags" className={`${ui.input} ${s.tagRowField}`} placeholder="Add tag and press Enter" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const added = tagsFromInput(e.currentTarget.value, (product.tags || []).map(tagName)); if (added.length) update({ tags: [...(product.tags || []), ...added.map(value => ({ value }))] }); e.currentTarget.value = '' } }} />
              </div>
            </div>
          </Card>

          <Card title="Pricing" sub="Price, compare-at and cost">
            <div className={s.threeCol}>
              <MoneyField id="product-price" label="Price" value={product.basePrice} onChange={v => update({ basePrice: v || 0 })} />
              <MoneyField id="product-compare-at" label="Compare-at price" value={product.compareAtPrice} onChange={v => update({ compareAtPrice: v })} />
              <MoneyField label="Cost per item" value={product.costPrice} onChange={v => update({ costPrice: v })} />
            </div>
            {/* Below cost the margin and profit are negative (it showed 0%). */}
            <div className={`${s.pricingPreview} ${pricing && pricing.profit < 0 ? s.pricingLoss : ''}`}>
              <div><span>Margin</span><strong>{pricing ? `${pricing.margin}%` : '—'}</strong></div>
              <div><span>Profit per item</span><strong>{pricing ? money(pricing.profit) : '—'}</strong></div>
            </div>
            {pricing && pricing.profit < 0 && <p className={s.pricingNote}>The price is below the cost per item: each sale loses {money(-pricing.profit)}.</p>}
            {!product.costPrice && <p className={`${ui.muted} ${s.pricingHint}`}>Add the cost per item to see the margin and profit on each sale. Customers never see it.</p>}
          </Card>
        </>}

        {tab === 'Inventory' && <>
          <Card title="Inventory" sub="Stock tracking and identifiers">
            {waitingCount > 0 && <div className={s.notice}><strong>{waitingCount} customer{waitingCount === 1 ? ' is' : 's are'} waiting for this</strong><span>They tapped &ldquo;Notify me when it&rsquo;s back&rdquo;. Add stock and save, and they get a message straight away.</span></div>}
            <div className={s.threeCol}>
              <Field label="SKU"><input id="product-sku" className={ui.input} value={product.sku} onChange={e => update({ sku: e.target.value })} /></Field>
              <Field label="Barcode"><input className={ui.input} value={product.barcode || ''} onChange={e => update({ barcode: e.target.value })} /></Field>
              <Field label="Low stock at"><NumInput className={ui.input} value={product.lowStockThreshold ?? 5} empty={0} onValue={v => update({ lowStockThreshold: v ?? 0 })} /></Field>
            </div>
            <div className={s.checkGrid}>
              <Check checked={product.trackInventory} onChange={v => update({ trackInventory: v })} title="Track inventory" text="Prevent overselling when stock is exhausted." />
              <Check checked={product.continueSellingWhenOutOfStock} onChange={v => update({ continueSellingWhenOutOfStock: v })} title="Continue selling when out of stock" text="Allow checkout at zero available inventory." />
              <Check checked={!!product.preorder} onChange={v => update({ preorder: v, ...(v ? { continueSellingWhenOutOfStock: true } : {}) })} title="Pre-order when sold out" text="Keeps selling at zero stock, shown to customers as a pre-order." />
            </div>
            {product.preorder && <Field label="Pre-order note (shown to customers)"><input className={ui.input} value={product.preorderNote || ''} maxLength={120} onChange={e => update({ preorderNote: e.target.value })} placeholder="e.g. Ships in about 2 weeks" /></Field>}
            <Field label="“Running low?” reminder after (days)"><NumInput className={ui.input} value={product.refillDays ?? null} empty={null} onValue={v => update({ refillDays: v })} placeholder="No reminder" /></Field>
            <p className={ui.muted} style={{ margin: 0 }}>For things customers buy again, like detergent or coffee: this many days after delivery, they get one email (or WhatsApp message) with a link that puts it back in their cart. Between 7 and 365 days; leave empty for none.</p>
            <div className={s.notice}><strong>{product.sharedInventory ? 'Shared inventory pool' : product.variants.length ? 'Variant inventory' : 'Product inventory'}</strong><span>{inventoryTotal} units represented by the current inventory mode.</span></div>
          </Card>
          {(!product.variants.length || product.sharedInventory) && <Card title="Product inventory" sub="Used for non-variant stock or a shared variant pool">
            {productLocationSplit ? <div className={s.notice}><strong>Stock is split across multiple locations</strong><span>{available} units total. Manage quantities per location in <b>Stock by location</b> below.</span></div> : <div className={s.threeCol}>
              <Field label="Available"><NumInput className={ui.input} value={available} empty={0} onValue={v => update({ quantity: v ?? 0 })} /></Field>
              <Field label="Location"><select className={ui.select} value={product.locationId ?? product.inventory?.[0]?.locationId ?? ''} onChange={e => update({ locationId: e.target.value || null })}><option value="">Unassigned</option>{(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <Field label="Low stock"><NumInput className={ui.input} value={product.lowStockThreshold ?? product.inventory?.[0]?.lowStockThreshold ?? 5} empty={0} onValue={v => update({ lowStockThreshold: v ?? 0 })} /></Field>
            </div>}
          </Card>}
          <Card title="Stock by location" sub="On-hand stock at each location. Each row saves on its own, so it does not wait for the product to be saved.">
            <StockByLocation rows={stockRows} onSave={saveStock} />
          </Card>
        </>}

        {tab === 'Variants' && <>
          <Card title="Options" sub="Up to three option dimensions">
            <div className={s.optionList}>
              {optionNames.map((n, i) => <div className={s.optionRow} key={i}>
                <input className={ui.input} aria-label={`Option ${i + 1} name`} placeholder={`Option ${i + 1} name`} value={n} onChange={e => { const a = [...optionNames]; a[i] = e.target.value; setOptionNames(a); setDirty(true) }} />
                <input className={ui.input} aria-label={`Option ${i + 1} values`} placeholder="Values separated by commas" value={optionText[i] || ''} onChange={e => { const a = [...optionText]; a[i] = e.target.value; setOptionText(a); setDirty(true) }} />
                {optionNames.length > 1 && <button type="button" className={ui.iconBtn} aria-label={`Remove option ${i + 1}`} onClick={() => { setOptionNames(optionNames.filter((_, x) => x !== i)); setOptionText(optionText.filter((_, x) => x !== i)); setDirty(true) }}><X size={15} /></button>}
              </div>)}
            </div>
            <div className="inline">
              <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { if (optionNames.length < 3) { setOptionNames(x => [...x, '']); setOptionText(x => [...x, '']); setDirty(true) } }} disabled={optionNames.length >= 3}><Plus size={15} /> Add option</button>
              <button className={ui.btn} onClick={generateVariants}><Plus size={15} /> Generate variants</button>
            </div>
          </Card>
          <Card title="Inventory mode" sub="Variant stock or one shared product pool">
            <Check checked={Boolean(product.sharedInventory)} onChange={v => update({ sharedInventory: v })} title="Shared inventory pool" text="All variants use the same product-level available quantity." />
          </Card>
          <Card title="Variants" sub={`${product.variants.length} variants`}>
            {product.variants.length > 0 && <div className="inline"><button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => { update({ variants: product.variants.map(v => ({ ...v, price: product.basePrice })) }); setMessage('Every variant now uses the product price. Save to apply.') }}>Use the product price for every variant</button></div>}
            <div className={s.variantHead} aria-hidden="true"><span>Variant</span><span>SKU</span><span>Price</span><span>Stock</span><span></span></div>
            {/* Each box is named for its variant (the column heads are only drawn). */}
            {product.variants.map((v, i) => { const label = (v.name || '').trim() || `Variant ${i + 1}`; return <div className={s.variantRow} key={v.id || i}>
              <input className={`${ui.input} ${s.variantField}`} aria-label={`Variant ${i + 1} name`} value={v.name} onChange={e => updateVariant(i, { name: e.target.value })} />
              <input className={`${ui.input} ${s.variantField}`} aria-label={`${label} SKU`} value={v.sku} onChange={e => updateVariant(i, { sku: e.target.value })} />
              <MoneyInput className={`${ui.input} ${s.variantField}`} aria-label={`${label} price`} cents={v.price} empty={0} onCents={c => updateVariant(i, { price: c ?? 0 })} />
              {variantLocationSplit(v) ? <span className={`${s.variantField} ${ui.muted}`} title="Stock is split across multiple locations -- manage it from the Inventory page">{variantStock(v)} (split)</span> : <NumInput className={`${ui.input} ${s.variantField}`} aria-label={`${label} stock`} value={variantStock(v)} empty={0} disabled={Boolean(product.sharedInventory)} onValue={q => updateVariant(i, { quantity: q ?? 0 })} />}
              <button type="button" className={`${ui.iconBtn} ${s.variantDeleteBtn}`} aria-label={`Remove variant ${label}`} onClick={() => update({ variants: product.variants.filter((_, n) => n !== i) })}><Trash2 size={16} /></button>
            </div> })}
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
            <Field label="Weight"><NumInput className={ui.input} decimals value={product.weight} onValue={w => update({ weight: w })} /></Field>
            <Field label="Weight unit"><select className={ui.select} value={product.weightUnit || 'kg'} onChange={e => update({ weightUnit: e.target.value })}><option>kg</option><option>g</option><option>lb</option><option>oz</option></select></Field>
            <Field label="Template"><select className={ui.select} value={product.productTemplate || 'product'} onChange={e => update({ productTemplate: e.target.value })}><option value="product">Default product</option><option value="product.featured">Featured product</option><option value="product.minimal">Minimal product</option></select></Field>
          </div>
        </Card>}

        {tab === 'Channels' && <Card title="Sales channels" sub="Where this product can be seen and bought">
          {creating ? <p className={ui.fieldHelp}>Save this product first to manage channel availability.</p> : (channels || []).length ? (channels || []).map((c: any) => {
            const pub = productPublications.find((p: any) => p.channelId === c.id)
            const isAvailable = pub ? pub.available : true
            return <Check
              key={c.id}
              checked={isAvailable}
              onChange={v => togglePublication(c.id, v)}
              title={c.name}
              text={isAvailable ? 'Visible and purchasable on this channel.' : 'Hidden from this channel.'}
            />
          }) : <p className={ui.fieldHelp}>No active sales channels yet.</p>}
        </Card>}

        {tab === 'Metafields' && <Card title="Metafields" sub="Structured custom data">
          {definitions.length ? definitions.map((d: any) => {
            const cur = product.metafields?.find((m: any) => m.definitionId === d.id)?.value || ''
            return <div className={s.field} key={d.id}>
              <label htmlFor={`metafield-${d.id}`}>{d.name}</label>
              <span id={`metafield-${d.id}-help`} className={ui.fieldHelp}>{d.namespace}.{d.key} · {d.type}{d.isList ? ' · list (comma-separated)' : ''}</span>
              <input id={`metafield-${d.id}`} aria-describedby={`metafield-${d.id}-help`} className={ui.input} placeholder={d.isList ? 'Value one, value two, value three' : undefined} value={cur} onChange={e => { const n = [...(product.metafields || [])].filter((m: any) => m.definitionId !== d.id); if (e.target.value) n.push({ definitionId: d.id, value: e.target.value }); update({ metafields: n }) }} />
            </div>
          }) : <div className={s.emptyInline}>No metafield definitions yet.</div>}
        </Card>}

        {tab === 'Search & SEO' && <Card title="Search engine listing" sub="SEO title, description and URL handle">
          <Field label="URL handle"><input className={ui.input} value={product.slug} onChange={e => update({ slug: e.target.value })} /></Field>
          <Field label="SEO title"><input className={ui.input} value={product.seoTitle || ''} onChange={e => update({ seoTitle: e.target.value })} /></Field>
          <Field label="SEO description"><textarea className={ui.textarea} rows={5} value={product.seoDescription || ''} onChange={e => update({ seoDescription: e.target.value })} /></Field>
          <div className={s.field}>
            <span>SEO image</span>
            <div className="inline" style={{ gap: 10 }}>
              {product.seoImageUrl && <img src={product.seoImageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--admin-border)' }} />}
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setSeoMediaPickerOpen(true)}>{product.seoImageUrl ? 'Change image' : 'Upload image'}</button>
              {product.seoImageUrl && <button type="button" className={ui.iconBtn} aria-label="Remove SEO image" onClick={() => update({ seoImageUrl: '' })}><X size={16} /></button>}
            </div>
          </div>
          <div className={s.notice} style={{ display: 'block' }}><strong>{product.seoTitle || product.name}</strong><span style={{ display: 'block', marginTop: 4 }}>/product/{product.slug || 'product-handle'}</span><span style={{ display: 'block', marginTop: 4 }}>{product.seoDescription || product.shortDescription || 'Add an SEO description.'}</span></div>
        </Card>}
      </div>

      <aside className={s.rail}>
        <Card title="Status" sub="Publishing"><span className={`${ui.statusPill} ${product.status === 'ACTIVE' ? ui.statusPillSuccess : product.status === 'DRAFT' ? ui.statusPillWarning : ''}`}>{product.status === 'ACTIVE' ? 'Active' : product.status === 'DRAFT' ? 'Draft' : 'Archived'}</span></Card>
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
    <MediaPicker open={seoMediaPickerOpen} onClose={() => setSeoMediaPickerOpen(false)} onAdd={images => { if (images[0]) update({ seoImageUrl: images[0].url }); setSeoMediaPickerOpen(false) }} />
  </div>
}
