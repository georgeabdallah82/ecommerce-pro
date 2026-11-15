'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { CheckCircle2, Copy, Download, Eye, MoreHorizontal, Plus, Search, Tag, Trash2, Upload, XCircle, X } from 'lucide-react'
import styles from './admin-collections.module.css'
import ui from './admin-ui.module.css'
import { useToast } from './admin-toast'
import { useConfirm } from './admin-confirm'
import { useModalFocus } from './use-modal-focus'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

// The list is read a page at a time (app/api/admin/collections). The search and the status filter run on the server.
const PAGE = 50

type CollectionsPage = { rows: any[]; total: number; counts: { all: number; active: number; inactive: number } }

function listQuery(skip: number, take: number, term: string, state: string) {
  const params = new URLSearchParams({ skip: String(skip), take: String(take), status: state })
  if (term) params.set('q', term)
  return params.toString()
}

export default function CollectionsAdminShopify({ initial }: { initial: CollectionsPage }) {
  const confirm = useConfirm()
  const toast = useToast()
  const [rows, setRows] = useState<any[]>(initial.rows)
  const [total, setTotal] = useState(initial.total)
  const [counts, setCounts] = useState(initial.counts)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  // The search and status the rows on screen were loaded for.
  const [applied, setApplied] = useState({ q: '', status: 'ALL' })
  const requestId = useRef(0)
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // Both dialogs are modal: focus moves in, Tab stays inside, Escape closes them and focus goes back to the opener.
  const addRef = useRef<HTMLDivElement>(null)
  const createRef = useRef<HTMLFormElement>(null)
  useModalFocus(addRef, addOpen, () => setAddOpen(false))
  useModalFocus(createRef, show, () => setShow(false))
  const [productQ, setProductQ] = useState('')
  const [productRows, setProductRows] = useState<any[]>([])
  const [productPick, setProductPick] = useState<string[]>([])
  const [productBusy, setProductBusy] = useState(false)
  const [productError, setProductError] = useState('')

  // Reloads the rows already on screen, with the same search and status.
  const refresh = async () => {
    const take = Math.min(200, Math.max(PAGE, rows.length))
    const d = await api(`/api/admin/collections?${listQuery(0, take, applied.q, applied.status)}`)
    setRows(d.rows); setTotal(d.total); setCounts(d.counts); setSelected([])
  }

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const d = await api(`/api/admin/collections?${listQuery(rows.length, PAGE, applied.q, applied.status)}`)
      setRows(current => [...current, ...d.rows]); setTotal(d.total); setCounts(d.counts)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to load collections', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  // A new search or status loads the first page again once typing pauses. Older responses are ignored.
  useEffect(() => {
    const term = q.trim()
    const id = ++requestId.current
    if (term === applied.q && status === applied.status) return
    const timer = window.setTimeout(async () => {
      try {
        const d = await api(`/api/admin/collections?${listQuery(0, PAGE, term, status)}`)
        if (id !== requestId.current) return
        setRows(d.rows); setTotal(d.total); setCounts(d.counts); setSelected([]); setApplied({ q: term, status })
      } catch (error) {
        if (id === requestId.current) toast(error instanceof Error ? error.message : 'Unable to load collections', 'error')
      }
    }, term === applied.q ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [q, status, applied])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({ name, slug: slug || undefined, description }),
      })
      setShow(false)
      setName('')
      setSlug('')
      setDescription('')
      await refresh()
      toast('Collection created')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to create collection', 'error')
    } finally {
      setBusy(false)
    }
  }

  const deleteCollection = async (collection: { id: string; name: string }) => {
    if (!(await confirm({ title: `Delete "${collection.name}"?`, message: 'Products stay in your store; only the collection is removed. This cannot be undone.', confirmLabel: 'Delete collection' }))) return
    try {
      await api(`/api/admin/collections/${collection.id}`, { method: 'DELETE' })
      await refresh()
      toast('Collection deleted')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to delete collection', 'error')
    }
  }

  // Adds the chosen products to every selected collection (see the bulk ADD_PRODUCTS action).
  useEffect(() => {
    if (!addOpen) return
    const timer = window.setTimeout(() => {
      const q = productQ.trim()
      api(`/api/admin/products?pageSize=50&sort=name_asc${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then(d => setProductRows(d.rows || []))
        .catch(e => setProductError(e instanceof Error ? e.message : 'Could not load products'))
    }, productQ ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [addOpen, productQ])

  const openAddProducts = () => { setProductPick([]); setProductQ(''); setProductError(''); setAddOpen(true) }
  const addProducts = async () => {
    if (!productPick.length || !selected.length) return
    setProductBusy(true); setProductError('')
    try {
      const d = await api('/api/admin/collections', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction: 'ADD_PRODUCTS', productIds: productPick }) })
      setAddOpen(false)
      await refresh()
      toast(d.added ? `Added ${d.added} product link${d.added === 1 ? '' : 's'} across ${d.collections} collection${d.collections === 1 ? '' : 's'}` : 'Those products are already in every selected collection')
    } catch (error) { setProductError(error instanceof Error ? error.message : 'Unable to add products') } finally { setProductBusy(false) }
  }

  const toggleRow = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  // Selects the rows on screen. Rows on pages not loaded yet are not included.
  const toggleAll = () => setSelected(current => current.length === rows.length ? [] : rows.map((c: any) => c.id))

  const bulk = async (bulkAction: 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'DUPLICATE') => {
    if (!selected.length) return
    if (bulkAction === 'DELETE' && !(await confirm({ title: `Delete ${selected.length} collection${selected.length === 1 ? '' : 's'}?`, message: 'Products stay in your store; only the collections are removed. This cannot be undone.', confirmLabel: 'Delete' }))) return
    const count = selected.length
    setBulkBusy(true)
    try {
      await api('/api/admin/collections', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction }) })
      await refresh()
      const verb = bulkAction === 'ACTIVATE' ? 'activated' : bulkAction === 'DEACTIVATE' ? 'deactivated' : bulkAction === 'DUPLICATE' ? 'duplicated (as hidden copies)' : 'deleted'
      toast(`${count} collection${count === 1 ? '' : 's'} ${verb}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to update collections', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const views: Array<[string, string]> = [
    ['ALL', 'All'],
    ['ACTIVE', 'Active'],
    ['INACTIVE', 'Inactive'],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={ui.muted}>MERCHANDISING</span>
          <h1 className={styles.title}>Collections</h1>
          <p className={ui.muted}>Group products into storefront-ready merchandising destinations.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/collections/import"><Upload size={16} /> Import</Link>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href="/api/admin/exports?type=collections"><Download size={16} /> Export</a>
          <button className={`${ui.btn} ${styles.headerBtn}`} onClick={() => setShow(true)}>
            <Plus size={16} /> Create collection
          </button>
        </div>
      </div>

      <div className={`${ui.card} ${styles.views}`}>
        {views.map(([value, label]) => (
          <button
            key={value}
            className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`}
            onClick={() => setStatus(value)}
          >
            {label}{' '}
            <span className={ui.muted}>
              {value === 'ALL' ? counts.all : value === 'ACTIVE' ? counts.active : counts.inactive}
            </span>
          </button>
        ))}
      </div>

      <div className={`${ui.card} ${styles.toolbar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search collections"
          />
          {q && (
            <button className={ui.iconBtn} onClick={() => setQ('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <span className={ui.pill}>{rows.length} of {total} shown</span>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {selected.length > 0 && (
        <div className={ui.bulkBar}>
          <div className={ui.bulkCount}><strong>{selected.length}</strong><span> selected</span></div>
          <div className={ui.bulkActions}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('ACTIVATE')}><CheckCircle2 size={15} /> Activate</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DEACTIVATE')}><XCircle size={15} /> Deactivate</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={openAddProducts}><Plus size={15} /> Add products</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DUPLICATE')}><Copy size={15} /> Duplicate</button>
            <button className={`${ui.btn} ${ui.btnDanger}`} disabled={bulkBusy} onClick={() => bulk('DELETE')}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      )}

      {addOpen && <div className={ui.modalOverlay} onClick={() => setAddOpen(false)}>
        <div ref={addRef} className={`${ui.card} ${styles.addDialog}`} role="dialog" aria-modal="true" aria-labelledby="add-products-title" onClick={e => e.stopPropagation()}>
          <h2 id="add-products-title">Add products to {selected.length} collection{selected.length === 1 ? '' : 's'}</h2>
          <p className={ui.muted}>Products already in a collection keep their place. New ones go to the end.</p>
          <input className={ui.input} value={productQ} onChange={e => setProductQ(e.target.value)} placeholder="Search products" aria-label="Search products" data-autofocus />
          {productError && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{productError}</div>}
          <div className={styles.productPick}>
            {productRows.map(p => {
              const on = productPick.includes(p.id)
              return <label key={p.id} className={styles.pickRow}>
                <input type="checkbox" checked={on} onChange={() => setProductPick(list => (on ? list.filter(x => x !== p.id) : [...list, p.id]))} />
                <span>{p.name}</span><small>{p.sku || 'No SKU'}</small>
              </label>
            })}
            {!productRows.length && <div className={ui.empty}>No products match.</div>}
          </div>
          <div className={styles.dialogFoot}>
            <span className={ui.muted}>{productPick.length} selected</span>
            <div className="inline">
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="button" className={ui.btn} disabled={!productPick.length || productBusy} onClick={addProducts}>{productBusy ? 'Adding…' : 'Add products'}</button>
            </div>
          </div>
        </div>
      </div>}

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${styles.resultsTable}`}>
            <thead>
              <tr>
                <th><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={toggleAll} aria-label="Select all collections on this page" /></th>
                <th>Collection</th>
                <th>Products</th>
                <th>Status</th>
                <th>Sales channel</th>
                <th>Updated</th>
                <th className={styles.actionsHead}><span className={styles.srOnly}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((collection) => (
                <tr key={collection.id}>
                  <td><input type="checkbox" checked={selected.includes(collection.id)} onChange={() => toggleRow(collection.id)} aria-label={`Select ${collection.name}`} /></td>
                  <td>
                    <div className={styles.cell}>
                      <div className={styles.thumb}>
                        {collection.imageUrl ? (
                          <img src={collection.imageUrl} alt="" />
                        ) : (
                          <Tag size={18} />
                        )}
                      </div>
                      <div>
                        <strong>{collection.name}</strong>
                        <span className={ui.muted}>/{collection.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td>{collection._count?.products ?? 0}</td>
                  <td>
                    <span className={`${ui.statusPill} ${collection.isActive ? ui.statusPillSuccess : ''}`}>
                      {collection.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.channel}>Online Store</span>
                  </td>
                  <td>
                    {collection.updatedAt ? new Date(collection.updatedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="inline">
                      <Link
                        className={ui.iconBtn}
                        href={`/admin/collections/${collection.id}`}
                        title="Edit" aria-label="Edit"
                      >
                        <MoreHorizontal size={16} />
                      </Link>
                      <Link
                        className={ui.iconBtn}
                        href={`/collections/${collection.slug}`}
                        target="_blank"
                        title="Preview" aria-label="Preview"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                        title="Delete collection" aria-label="Delete collection"
                        onClick={() => deleteCollection(collection)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className={ui.empty}>No collections match your current filters.</div>}
      </div>

      {rows.length < total && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${total - rows.length} left)`}
          </button>
        </div>
      )}

      {show && (
        <div className={ui.modalOverlay} onClick={() => setShow(false)}>
          <form
            ref={createRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-collection-title"
            className={ui.card}
            style={{ width: 'min(560px,94vw)', padding: 24 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={create}
          >
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}>
              <div>
                <h2 id="create-collection-title" className={styles.modalTitle}>Create collection</h2>
                <p className={ui.muted}>Set the collection identity now; products can be arranged from its editor.</p>
              </div>
              <button type="button" className={ui.iconBtn} onClick={() => setShow(false)} aria-label="Close">
                ×
              </button>
            </div>
            <label className={ui.fieldLabel}>
              Name
              <input className={ui.input} required value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
            </label>
            <label className={ui.fieldLabel}>
              Handle
              <input
                className={ui.input}
                placeholder="summer-sale"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
            <label className={ui.fieldLabel}>
              Description
              <textarea
                className={ui.textarea}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShow(false)}>
                Cancel
              </button>
              <button className={ui.btn} disabled={busy}>
                {busy ? 'Creating…' : 'Create collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
