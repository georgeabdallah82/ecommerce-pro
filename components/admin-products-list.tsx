'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Star, StarOff, Tag, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-products-list.module.css'
import ui from './admin-ui.module.css'

type ProductRow = any

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

function stockInfo(product: ProductRow) {
  const direct = (product.inventory || []).filter((row: any) => !row.variantId)
  const variants = (product.variants || []).flatMap((variant: any) => variant.inventory || [])
  const source = direct.length ? direct : variants
  const available = source.reduce((sum: number, row: any) => sum + Number(row.quantity || 0) - Number(row.reserved || 0), 0)
  const reserved = source.reduce((sum: number, row: any) => sum + Number(row.reserved || 0), 0)
  return { available: Math.max(0, available), reserved, tracked: Boolean(product.trackInventory) }
}

const statusClass: Record<string, string> = { ACTIVE: styles.statusActive, DRAFT: styles.statusDraft, ARCHIVED: styles.statusArchived }

export default function AdminProductsList({ initial }: { initial: any }) {
  const firstRows = Array.isArray(initial) ? initial : initial?.rows || []
  const [rows, setRows] = useState<ProductRow[]>(firstRows)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [categoryId, setCategoryId] = useState('ALL')
  const [sort, setSort] = useState('updated_desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(Number(initial?.total || firstRows.length || 0))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  const [categories, setCategories] = useState<any[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  useEffect(() => {
    api('/api/admin/categories').then(data => setCategories(Array.isArray(data) ? data : data.rows || data.categories || [])).catch(() => undefined)
  }, [])

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q, status, categoryId, sort, page: String(nextPage), pageSize: String(pageSize) })
      const data = await api(`/api/admin/products?${params.toString()}`)
      setRows(data.rows || [])
      setTotal(Number(data.total || 0))
      setPages(Number(data.pages || 1))
      setPage(Number(data.page || nextPage))
      setSelected([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(1) }, [status, categoryId, sort, pageSize])

  const allSelected = rows.length > 0 && rows.every(product => selected.includes(product.id))
  const draftCount = useMemo(() => rows.filter(product => product.status === 'DRAFT').length, [rows])
  const activeCount = useMemo(() => rows.filter(product => product.status === 'ACTIVE').length, [rows])
  const archivedCount = useMemo(() => rows.filter(product => product.status === 'ARCHIVED').length, [rows])

  function toggle(id: string) { setSelected(current => (current.includes(id) ? current.filter(value => value !== id) : [...current, id])) }
  function toggleAll() { setSelected(allSelected ? [] : rows.map(product => product.id)) }

  async function bulk(action: string) {
    if (!selected.length) return
    setLoading(true)
    setError('')
    setNotice('')
    setBulkOpen(false)
    try {
      const data = await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction: action }) })
      const count = Number(data.count || selected.length)
      setNotice(`${count} product${count === 1 ? '' : 's'} updated`)
      await load(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk action failed')
    } finally {
      setLoading(false)
    }
  }

  const views: Array<[string, string, number]> = [
    ['ALL', 'All', total],
    ['ACTIVE', 'Active', activeCount],
    ['DRAFT', 'Draft', draftCount],
    ['ARCHIVED', 'Archived', archivedCount],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Catalog</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Products</h1>
            <span className={styles.countPill}>{total.toLocaleString()}</span>
          </div>
        </div>
        <Link className={ui.btn} href="/admin/products/new"><Plus size={16} /> Add product</Link>
      </div>

      {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
      {notice && <div className={ui.alert}>{notice}</div>}

      <div className={`${styles.viewBar} ${ui.card}`}>
        <div className={styles.views} role="tablist" aria-label="Product views">
          {views.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`}
              onClick={() => setStatus(value)}
            >
              <span>{label}</span><small>{count.toLocaleString()}</small>
            </button>
          ))}
        </div>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFiltersOpen(value => !value)}>
          Filters <ChevronDown className={`${styles.chevron}${filtersOpen ? ` ${styles.chevronOpen}` : ''}`} size={15} />
        </button>
      </div>

      <div className={`${ui.card} ${styles.filterBar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input value={q} onChange={event => setQ(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void load(1) }} placeholder="Search products" aria-label="Search products" />
          {q && <button type="button" onClick={() => { setQ(''); void load(1) }} aria-label="Clear search"><X size={14} /></button>}
        </div>
        {filtersOpen && (
          <div className={styles.filterGrid}>
            <label>
              <span>Category</span>
              <select className={ui.input} value={categoryId} onChange={event => setCategoryId(event.target.value)}>
                <option value="ALL">All categories</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select className={ui.input} value={sort} onChange={event => setSort(event.target.value)}>
                <option value="updated_desc">Recently updated</option>
                <option value="created_desc">Newest</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
                <option value="price_asc">Price low–high</option>
                <option value="price_desc">Price high–low</option>
              </select>
            </label>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => load(1)} disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className={ui.bulkBar}>
          <div className={ui.bulkCount}><strong>{selected.length}</strong><span> selected</span></div>
          <div className={ui.bulkActions}>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => bulk('ACTIVE')}><CheckCircle2 size={15} /> Activate</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => bulk('DRAFT')}><Tag size={15} /> Draft</button>
            <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => bulk('ARCHIVED')}><Archive size={15} /> Archive</button>
            <div className={styles.actionMenu}>
              <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setBulkOpen(value => !value)}>More <ChevronDown size={14} /></button>
              {bulkOpen && (
                <div className={styles.menu}>
                  <button onClick={() => bulk('FEATURED_ON')}><Star size={14} /> Feature products</button>
                  <button onClick={() => bulk('FEATURED_OFF')}><StarOff size={14} /> Unfeature products</button>
                  <button onClick={() => setSelected([])}><X size={14} /> Clear selection</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={styles.tableMeta}>
          <span>{total.toLocaleString()} products</span>
          <label>Rows
            <select className={`${ui.input} ${ui.inputCompact}`} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
        <div className={ui.tableWrap}>
          <table className={styles.productTable}>
            <thead>
              <tr>
                <th><input aria-label="Select all products" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th>Product</th>
                <th>Status</th>
                <th>Inventory</th>
                <th>Category</th>
                <th>Price</th>
                <th>Sales channels</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(product => {
                const stock = stockInfo(product)
                return (
                  <tr key={product.id} className={selected.includes(product.id) ? styles.selectedRow : undefined}>
                    <td><input aria-label={`Select ${product.name}`} type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} /></td>
                    <td>
                      <Link className={styles.productCell} href={`/admin/products/${product.id}`}>
                        <div className={styles.thumb}>{product.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <span aria-hidden="true">◎</span>}</div>
                        <div><strong>{product.name}</strong><span>{product.sku || 'No SKU'}{product.featured ? ' · Featured' : ''}</span></div>
                      </Link>
                    </td>
                    <td><span className={`${styles.status} ${statusClass[product.status] || ''}`}>{product.status}</span></td>
                    <td>
                      {stock.tracked ? (
                        <div className={stock.available <= 5 ? `${styles.stock} ${styles.stockLow}` : styles.stock}>
                          <strong>{stock.available}</strong><span>{stock.reserved ? `${stock.reserved} reserved` : 'available'}</span>
                        </div>
                      ) : <span className={ui.muted}>Not tracked</span>}
                    </td>
                    <td>{product.category?.name || '—'}</td>
                    <td><strong>{money(product.basePrice)}</strong>{product.compareAtPrice ? <div className={`${ui.muted} strike`}>{money(product.compareAtPrice)}</div> : null}</td>
                    <td><span className={styles.channel}>Online Store</span></td>
                    <td>{new Date(product.updatedAt).toLocaleDateString()}</td>
                    <td><Link className={ui.iconBtn} href={`/admin/products/${product.id}`} title="Open product"><MoreHorizontal size={17} /></Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className={ui.empty}>No products match your current view.</div>}
        <div className={styles.pagination}>
          <span className={ui.muted}>Page {page} of {pages}</span>
          <div className="inline">
            <button className={ui.iconBtn} disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16} /></button>
            <button className={ui.iconBtn} disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
