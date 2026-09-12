'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Eye, GripVertical, Image as ImageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-collection-editor.module.css'
import UnsavedBar from './admin-unsaved-bar'
import MediaPicker from './media-picker'

type Product = { id: string; name: string; slug: string; sku?: string | null; status: string; basePrice: number; images?: { url: string }[]; category?: { name: string } | null }
type Collection = { id: string; name: string; slug: string; description?: string | null; imageUrl?: string | null; isActive: boolean; products: { product: Product }[] }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function CollectionEditorShopify({ id }: { id: string }) {
  const router = useRouter()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [original, setOriginal] = useState<{ collection: Collection | null; selected: string[] }>({ collection: null, selected: [] })

  useEffect(() => {
    Promise.all([api(`/api/admin/collections/${id}`), api('/api/admin/products?page=1&pageSize=100&sort=name_asc')])
      .then(([c, p]) => {
        setCollection(c.collection); setProducts(p.rows || []); setLoading(false)
        setOriginal({ collection: c.collection, selected: c.collection.products.map((x: any) => x.product.id) })
      })
      .catch(e => { setError(e instanceof Error ? e.message : 'Unable to load collection'); setLoading(false) })
  }, [id])
  useEffect(() => { if (collection) setSelected(collection.products.map(x => x.product.id)) }, [collection?.id])

  const filteredProducts = useMemo(() => products.filter(p => !q || `${p.name} ${p.sku || ''}`.toLowerCase().includes(q.toLowerCase())), [products, q])
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const existingById = useMemo(() => new Map((collection?.products || []).map(x => [x.product.id, x.product])), [collection?.products])
  const assigned = selected.map(id => productById.get(id) || existingById.get(id)).filter(Boolean) as Product[]

  function setField(p: Partial<Collection>) { setCollection(c => c ? { ...c, ...p } : c); setDirty(true); setNotice('') }
  function toggleProduct(product: Product) { setSelected(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id]); setDirty(true); setNotice('') }
  function removeAssigned(productId: string) { setSelected(current => current.filter(x => x !== productId)); setDirty(true); setNotice('') }

  async function save() {
    if (!collection) return
    setSaving(true); setError(''); setNotice('')
    try {
      await api(`/api/admin/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name: collection.name, slug: collection.slug, description: collection.description || null, imageUrl: collection.imageUrl || null, isActive: collection.isActive, productIds: selected }) })
      const fresh = await api(`/api/admin/collections/${id}`)
      const freshSelected = fresh.collection.products.map((x: any) => x.product.id)
      setCollection(fresh.collection)
      setSelected(freshSelected)
      setOriginal({ collection: fresh.collection, selected: freshSelected })
      setDirty(false)
      setNotice('Collection saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save collection') }
    finally { setSaving(false) }
  }

  function discard() {
    setCollection(original.collection)
    setSelected(original.selected)
    setDirty(false); setError(''); setNotice('')
  }

  async function remove() {
    if (!collection || !confirm(`Delete "${collection.name}"? This cannot be undone.`)) return
    setDeleting(true); setError('')
    try {
      await api(`/api/admin/collections/${id}`, { method: 'DELETE' })
      router.push('/admin/collections')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete collection'); setDeleting(false) }
  }

  if (loading) return <div className={s.loading}>Loading collection…</div>
  if (!collection) return <div className={ui.empty}>{error || 'Collection not found.'}</div>

  return <div className={s.page}>
    <div className={s.topbar}>
      <div className={s.topbarTitle}>
        <Link href="/admin/collections" className={ui.iconBtn}><ArrowLeft size={18} /></Link>
        <div>
          <div className={`${ui.muted} ${ui.tiny}`}>COLLECTION</div>
          <h1>{collection.name || 'Untitled collection'}</h1>
        </div>
      </div>
      <div className="inline">
        <Link className={`${ui.btn} ${ui.btnSecondary} ${s.topbarBtn}`} href={`/collections/${collection.slug}`} target="_blank"><Eye size={16} /> Preview</Link>
        <button className={`${ui.btn} ${ui.btnSecondary} ${s.topbarBtn}`} disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : <><Trash2 size={16} /> Delete</>}</button>
      </div>
    </div>

    <UnsavedBar dirty={dirty} saving={saving} onDiscard={discard} onSave={save} />

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

    <div className={s.grid}>
      <main className={s.main}>
        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}><div><h2>Collection details</h2><p>Control how this collection is named and presented in your store.</p></div></div>
          <div className={s.fields}>
            <label>Name<input className={ui.input} value={collection.name} onChange={e => setField({ name: e.target.value })} /></label>
            <label>Handle<input className={ui.input} value={collection.slug} onChange={e => setField({ slug: e.target.value })} /></label>
            <label>Description<textarea className={ui.textarea} rows={7} value={collection.description || ''} onChange={e => setField({ description: e.target.value })} /></label>
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
          <div className={s.cardHead}>
            <div><h2>Products</h2><p>{selected.length} product{selected.length === 1 ? '' : 's'} in this collection</p></div>
            <button className={ui.btn} onClick={() => setPickerOpen(true)}><Plus size={16} /> Add products</button>
          </div>
          {assigned.length ? <div className={s.assignedList}>{assigned.map(p => <div className={s.assignedRow} key={p.id}>
            <GripVertical size={16} />
            <div className={s.assignedThumb}>{p.images?.[0]?.url ? <img src={p.images[0].url} alt="" /> : <span>◎</span>}</div>
            <div className={s.assignedInfo}><Link href={`/admin/products/${p.id}`}><strong>{p.name}</strong></Link><span>{p.sku || 'No SKU'}{p.category?.name ? ` · ${p.category.name}` : ''}</span></div>
            <div className={s.assignedPrice}>{(Number(p.basePrice || 0) / 100).toFixed(2)}</div>
            <button className={ui.iconBtn} title="Remove" onClick={() => removeAssigned(p.id)}><Trash2 size={16} /></button>
          </div>)}</div> : <div className="emptyInline">No products yet. Add products to build this collection.</div>}
        </section>
      </main>

      <aside className={s.side}>
        <section className={`${ui.card} ${s.card}`}>
          <div className={s.cardHead}><div><h2>Status</h2><p>Control storefront visibility.</p></div></div>
          <button className={collection.isActive ? `${s.status} ${s.statusActive}` : s.status} onClick={() => setField({ isActive: !collection.isActive })}>
            <span className={s.statusDot} />
            <span><strong>{collection.isActive ? 'Active' : 'Inactive'}</strong><small>{collection.isActive ? 'Visible in the Online Store' : 'Hidden from the Online Store'}</small></span>
          </button>
        </section>
        <section className={`${ui.card} ${s.card}`}>
          <h2>Storefront</h2>
          <div className={s.metaRow}><span>URL</span><code>/collections/{collection.slug}</code></div>
          <div className={s.metaRow}><span>Products</span><strong>{selected.length}</strong></div>
        </section>
      </aside>
    </div>

    {pickerOpen && <div className={ui.modalOverlay} onClick={() => setPickerOpen(false)}>
      <div className={`${ui.card} ${s.picker}`} onClick={e => e.stopPropagation()}>
        <div className={s.pickerHead}>
          <div><h2>Add products</h2><p>Select products to include in this collection.</p></div>
          <button className={ui.iconBtn} onClick={() => setPickerOpen(false)}><X size={17} /></button>
        </div>
        <div className={s.pickerSearch}><Search size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" /></div>
        <div className={s.pickerList}>
          {filteredProducts.map(p => {
            const checked = selected.includes(p.id)
            return <button key={p.id} className={checked ? `${s.pickerProduct} ${s.pickerSelected}` : s.pickerProduct} onClick={() => toggleProduct(p)}>
              <span className={s.pickerCheck}>{checked ? <Check size={15} /> : null}</span>
              <span className={s.pickerThumb}>{p.images?.[0]?.url ? <img src={p.images[0].url} alt="" /> : <span>◎</span>}</span>
              <span className={s.pickerInfo}><strong>{p.name}</strong><small>{p.sku || 'No SKU'} · {p.status}</small></span>
            </button>
          })}
          {!filteredProducts.length && <div className={ui.empty}>No products found.</div>}
        </div>
        <div className={s.pickerFoot}>
          <span className={ui.muted}>{selected.length} selected</span>
          <div className="inline">
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setPickerOpen(false)}>Cancel</button>
            <button className={ui.btn} onClick={() => setPickerOpen(false)}>Done</button>
          </div>
        </div>
      </div>
    </div>}

    <MediaPicker open={mediaPickerOpen} onClose={() => setMediaPickerOpen(false)} onAdd={images => { if (images[0]) setField({ imageUrl: images[0].url }); setMediaPickerOpen(false) }} />
  </div>
}
