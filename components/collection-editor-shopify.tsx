'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Eye, Image as ImageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import { money } from '@/lib/config'
import { collectionReadiness, summarizeReadiness } from '@/lib/editor-readiness'
import ui from './admin-ui.module.css'
import s from './admin-collection-editor.module.css'
import UnsavedBar from './admin-unsaved-bar'
import MediaPicker from './media-picker'
import { useConfirm } from './admin-confirm'
import { ReadinessPanel } from './admin-readiness'
import { useLeaveGuard } from './use-leave-guard'

type Product = { id: string; name: string; slug: string; sku?: string | null; status: string; basePrice: number; images?: { url: string }[] }
type Collection = { id: string; name: string; slug: string; description?: string | null; imageUrl?: string | null; isActive: boolean; products: { product: Product }[]; seoTitle?: string | null; seoDescription?: string | null }

const PAGE_SIZE = 24
const STATUS_WORD: Record<string, string> = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

// Products > Collections > one collection. Products are picked with a search (so every product
// can be found, not just the first page), ordered with the arrows (the storefront shows them in
// this order), and the page says what must be fixed before the collection can go live.
export default function CollectionEditorShopify({ id, currency = 'USD' }: { id: string; currency?: string }) {
  const confirm = useConfirm()
  const router = useRouter()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  // Product ids in the order they are shown on the storefront.
  const [selected, setSelected] = useState<string[]>([])
  const [original, setOriginal] = useState<{ collection: Collection | null; selected: string[] }>({ collection: null, selected: [] })
  // Every product seen so far, by id, so each selected product can be shown with its name and status.
  const [known, setKnown] = useState<Map<string, Product>>(() => new Map())

  // The product picker: changes are kept in `draft` until Done, so Cancel really cancels.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [pickerRows, setPickerRows] = useState<Product[]>([])
  const [pickerPage, setPickerPage] = useState(1)
  const [pickerPages, setPickerPages] = useState(1)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState('')

  function load() {
    setLoading(true); setError('')
    api(`/api/admin/collections/${id}`)
      .then(c => {
        const products: Product[] = c.collection.products.map((x: { product: Product }) => x.product)
        setCollection(c.collection); setLoading(false)
        setKnown(new Map(products.map(p => [p.id, p])))
        const ids = products.map(p => p.id)
        setSelected(ids)
        setOriginal({ collection: c.collection, selected: ids })
        setDirty(false)
      })
      .catch(e => { setError(e instanceof Error ? e.message : 'Unable to load collection'); setLoading(false) })
  }

  useEffect(load, [id])

  // The picker's search, one page at a time. Typing restarts from the first page.
  useEffect(() => {
    if (!pickerOpen) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setPickerLoading(true); setPickerError('')
      const q = query.trim()
      api(`/api/admin/products?page=${pickerPage}&pageSize=${PAGE_SIZE}&sort=name_asc${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then(d => {
          if (cancelled) return
          const rows: Product[] = d.rows || []
          setPickerRows(prev => (pickerPage === 1 ? rows : [...prev, ...rows]))
          setPickerPages(d.pages || 1)
          setKnown(prev => { const next = new Map(prev); for (const p of rows) next.set(p.id, p); return next })
        })
        .catch(e => { if (!cancelled) setPickerError(e instanceof Error ? e.message : 'Could not load products') })
        .finally(() => { if (!cancelled) setPickerLoading(false) })
    }, query ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [pickerOpen, query, pickerPage])

  const assigned = useMemo(() => selected.map(pid => known.get(pid)).filter((p): p is Product => !!p), [selected, known])
  const hiddenCount = assigned.filter(p => p.status !== 'ACTIVE').length
  const readiness = useMemo(() => collectionReadiness({
    name: collection?.name || '', slug: collection?.slug || '', description: collection?.description, imageUrl: collection?.imageUrl,
    isActive: collection?.isActive ?? true, products: assigned.map(p => ({ status: p.status })), seoDescription: collection?.seoDescription,
  }), [collection, assigned])
  const readySummary = summarizeReadiness(readiness)

  function setField(p: Partial<Collection>) { setCollection(c => (c ? { ...c, ...p } : c)); setDirty(true); setNotice('') }
  function removeAssigned(productId: string) { setSelected(current => current.filter(x => x !== productId)); setDirty(true); setNotice('') }
  function move(index: number, direction: -1 | 1) {
    setSelected(current => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setDirty(true); setNotice('')
  }

  function openPicker() { setDraft(selected); setQuery(''); setPickerPage(1); setPickerError(''); setPickerOpen(true) }
  function closePicker() { setPickerOpen(false) }
  function toggleDraft(productId: string) { setDraft(list => (list.includes(productId) ? list.filter(x => x !== productId) : [...list, productId])) }
  function donePicker() {
    if (JSON.stringify(draft) !== JSON.stringify(selected)) { setSelected(draft); setDirty(true); setNotice('') }
    setPickerOpen(false)
  }

  async function save() {
    if (!collection || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      await api(`/api/admin/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name: collection.name, slug: collection.slug, description: collection.description || null, imageUrl: collection.imageUrl || null, isActive: collection.isActive, seoTitle: collection.seoTitle || null, seoDescription: collection.seoDescription || null, productIds: selected }) })
      const fresh = await api(`/api/admin/collections/${id}`)
      const products: Product[] = fresh.collection.products.map((x: { product: Product }) => x.product)
      const freshSelected = products.map(p => p.id)
      setCollection(fresh.collection)
      setKnown(prev => { const next = new Map(prev); for (const p of products) next.set(p.id, p); return next })
      setSelected(freshSelected)
      setOriginal({ collection: fresh.collection, selected: freshSelected })
      setDirty(false)
      setNotice('Collection saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save collection') }
    finally { setSaving(false) }
  }

  // Ctrl/Cmd+S saves while there are changes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (dirty) void save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // save() reads the current collection, so the listener follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, collection, selected])

  // Asks before leaving with unsaved changes: admin links, Back, reload (components/use-leave-guard.ts).
  useLeaveGuard(dirty)

  function discard() {
    setCollection(original.collection)
    setSelected(original.selected)
    setDirty(false); setError(''); setNotice('')
  }

  async function remove() {
    if (!collection || !(await confirm({ title: `Delete "${collection.name}"?`, message: 'Products stay in your store; only the collection is removed. This cannot be undone.', confirmLabel: 'Delete collection' }))) return
    setDeleting(true); setError('')
    try {
      await api(`/api/admin/collections/${id}`, { method: 'DELETE' })
      router.push('/admin/collections')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete collection'); setDeleting(false) }
  }

  if (loading) return <div className={s.loading}>Loading collection…</div>
  if (!collection) return <div className={ui.empty}>
    <p>{error || 'Collection not found.'}</p>
    {error && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={load}>Retry</button>}
  </div>

  return <div className={s.page}>
    <div className={s.topbar}>
      <div className={s.topbarTitle}>
        <Link href="/admin/collections" className={ui.iconBtn} aria-label="Back to collections"><ArrowLeft size={18} /></Link>
        <div>
          <div className={`${ui.muted} ${ui.tiny}`}>COLLECTION</div>
          <h1>{collection.name || 'Untitled collection'}</h1>
        </div>
      </div>
      <div className="inline">
        {collection.isActive
          ? <Link className={`${ui.btn} ${ui.btnSecondary} ${s.topbarBtn}`} href={`/collections/${collection.slug}`} target="_blank"><Eye size={16} /> Preview</Link>
          : <span className={`${ui.btn} ${ui.btnSecondary} ${s.topbarBtn}`} aria-disabled="true" title="Turn the collection on to preview it" style={{ opacity: .5, cursor: 'not-allowed' }}><Eye size={16} /> Preview</span>}
        <button className={`${ui.btn} ${ui.btnDanger} ${s.topbarBtn}`} disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : <><Trash2 size={16} /> Delete</>}</button>
      </div>
    </div>

    <UnsavedBar dirty={dirty} saving={saving} onDiscard={discard} onSave={save} />

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    <div className={s.grid}>
      <main className={s.main}>
        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}><div><h2>Collection details</h2><p>How this collection is named and presented in your store.</p></div></div>
          <div className={s.fields}>
            <label>Name<input className={ui.input} value={collection.name} onChange={e => setField({ name: e.target.value })} /></label>
            <label>Address (handle)<input className={ui.input} value={collection.slug} onChange={e => setField({ slug: e.target.value })} aria-describedby="collection-handle-note" /></label>
            <span id="collection-handle-note" className={ui.fieldHelp}>Customers reach this collection at /collections/{collection.slug || 'address'}. Changing it breaks links that already point to it.</span>
            <label>Description<textarea className={ui.textarea} rows={6} value={collection.description || ''} onChange={e => setField({ description: e.target.value })} /></label>
            <label>Collection image
              <div className={s.imageField}>
                <div className={s.imagePreview}>{collection.imageUrl ? <img src={collection.imageUrl} alt="" /> : <ImageIcon size={24} />}</div>
                <div className="inline">
                  <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setMediaPickerOpen(true)}>{collection.imageUrl ? 'Change image' : 'Upload image'}</button>
                  {collection.imageUrl && <button type="button" className={ui.iconBtn} aria-label="Remove image" onClick={() => setField({ imageUrl: '' })}><X size={16} /></button>}
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}><div><h2>Search listing</h2><p>How the collection appears in Google, and when it is shared.</p></div></div>
          <div className={s.fields}>
            <label>Search title<input className={ui.input} maxLength={120} value={collection.seoTitle || ''} placeholder={collection.name} onChange={e => setField({ seoTitle: e.target.value })} /></label>
            <span className={ui.fieldHelp}>{(collection.seoTitle || '').length}/70 characters. Leave empty to use the name.</span>
            <label>Search description<textarea className={ui.textarea} rows={3} maxLength={320} value={collection.seoDescription || ''} onChange={e => setField({ seoDescription: e.target.value })} /></label>
            <span className={ui.fieldHelp}>{(collection.seoDescription || '').length}/160 characters.</span>
          </div>
          <div className={s.snippet} aria-label="Search preview">
            <span className={s.snippetUrl}>/collections/{collection.slug || 'address'}</span>
            <strong className={s.snippetTitle}>{collection.seoTitle || collection.name || 'Collection name'}</strong>
            <p className={s.snippetText}>{collection.seoDescription || collection.description || 'Add a search description so search results explain this collection.'}</p>
          </div>
        </section>

        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}>
            <div>
              <h2>Products</h2>
              <p>{plural(selected.length, 'product')} in this collection{hiddenCount ? `, ${hiddenCount} not shown to customers` : ''}. Customers see them in this order.</p>
            </div>
            <button type="button" className={ui.btn} onClick={openPicker}><Plus size={16} /> Add products</button>
          </div>
          {assigned.length ? <div className={s.assignedList}>{assigned.map((p, i) => <div className={s.assignedRow} key={p.id}>
            <div className={s.rowMove}>
              <button type="button" className={ui.iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}><ArrowUp size={14} /></button>
              <button type="button" className={ui.iconBtn} disabled={i === assigned.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`}><ArrowDown size={14} /></button>
            </div>
            <div className={s.assignedThumb}>{p.images?.[0]?.url ? <img src={p.images[0].url} alt="" /> : <span>◎</span>}</div>
            <div className={s.assignedInfo}>
              <Link href={`/admin/products/${p.id}`}><strong>{p.name}</strong></Link>
              <span>{p.sku || 'No SKU'}{p.status !== 'ACTIVE' && <em className={s.hiddenChip}>Not shown: {STATUS_WORD[p.status] || p.status}</em>}</span>
            </div>
            <div className={s.assignedPrice}>{money(Number(p.basePrice || 0), currency)}</div>
            <button type="button" className={ui.iconBtn} title="Remove from this collection" aria-label={`Remove ${p.name}`} onClick={() => removeAssigned(p.id)}><Trash2 size={16} /></button>
          </div>)}</div> : <div className="emptyInline">No products yet. Add products to build this collection.</div>}
        </section>
      </main>

      <aside className={s.side}>
        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}><div><h2>Visibility</h2><p>Whether customers can open this collection.</p></div></div>
          <button type="button" className={collection.isActive ? `${s.status} ${s.statusActive}` : s.status} onClick={() => setField({ isActive: !collection.isActive })} aria-pressed={collection.isActive}>
            <span className={s.statusDot} />
            <span><strong>{collection.isActive ? 'Active' : 'Inactive'}</strong><small>{collection.isActive ? 'Visible in the Online Store' : 'Hidden from the Online Store'}</small></span>
          </button>
        </section>
        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}>
            <div><h2>Before it goes live</h2><p>{readySummary.ready ? 'Everything is in place.' : readySummary.blocks ? `${readySummary.blocks} to fix` : `${readySummary.warnings} to review`}</p></div>
          </div>
          <ReadinessPanel checks={readiness} />
        </section>
        <section className={`${ui.card} ${s.card}`}>
          <h2>Storefront</h2>
          <div className={s.metaRow}><span>Address</span><code>/collections/{collection.slug}</code></div>
          <div className={s.metaRow}><span>Products</span><strong>{selected.length}</strong></div>
        </section>
      </aside>
    </div>

    {pickerOpen && <div className={ui.modalOverlay} onClick={closePicker}>
      <div className={`${ui.card} ${s.picker}`} role="dialog" aria-modal="true" aria-labelledby="collection-picker-title" onClick={e => e.stopPropagation()}>
        <div className={s.pickerHead}>
          <div><h2 id="collection-picker-title">Add products</h2><p>Search by name or SKU. Tick the products to include.</p></div>
          <button type="button" className={ui.iconBtn} onClick={closePicker} aria-label="Close"><X size={17} /></button>
        </div>
        <div className={s.pickerSearch}>
          <Search size={16} aria-hidden="true" />
          <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setPickerPage(1) }} placeholder="Search products…" aria-label="Search products" />
        </div>
        {pickerError && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{pickerError}</div>}
        <div className={s.pickerList}>
          {pickerRows.map(p => {
            const checked = draft.includes(p.id)
            return <button type="button" key={p.id} className={checked ? `${s.pickerProduct} ${s.pickerSelected}` : s.pickerProduct} aria-pressed={checked} onClick={() => toggleDraft(p.id)}>
              <span className={s.pickerCheck}>{checked ? <Check size={15} /> : null}</span>
              <span className={s.pickerThumb}>{p.images?.[0]?.url ? <img src={p.images[0].url} alt="" /> : <span>◎</span>}</span>
              <span className={s.pickerInfo}><strong>{p.name}</strong><small>{p.sku || 'No SKU'} · {STATUS_WORD[p.status] || p.status}</small></span>
            </button>
          })}
          {!pickerLoading && !pickerRows.length && !pickerError && <div className={ui.empty}>{query.trim() ? `No products match “${query.trim()}”.` : 'No products yet.'}</div>}
          {pickerLoading && <div className={ui.muted} role="status">Loading products…</div>}
          {!pickerLoading && pickerPage < pickerPages && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${s.loadMore}`} onClick={() => setPickerPage(p => p + 1)}>Show more products</button>}
        </div>
        <div className={s.pickerFoot}>
          <span className={ui.muted}>{plural(draft.length, 'product')} selected</span>
          <div className="inline">
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={closePicker}>Cancel</button>
            <button type="button" className={ui.btn} onClick={donePicker}>Done</button>
          </div>
        </div>
      </div>
    </div>}

    <MediaPicker open={mediaPickerOpen} onClose={() => setMediaPickerOpen(false)} onAdd={images => { if (images[0]) setField({ imageUrl: images[0].url }); setMediaPickerOpen(false) }} />
  </div>
}

function plural(n: number, one: string) { return `${n} ${n === 1 ? one : `${one}s`}` }
