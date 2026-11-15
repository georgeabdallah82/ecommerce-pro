'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { Archive, CheckCircle2, ChevronDown, Download, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Star, StarOff, Tag, Trash2, Upload, X } from 'lucide-react'
import ProductExportDialog from './product-export-dialog'
import AdminMenu from './admin-menu'
import { useConfirm } from './admin-confirm'
import { money } from '@/lib/config'
import { channelsShowing, type ProductViewCounts } from '@/lib/product-editor'
import styles from './admin-products-list.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

type ProductRow = any

async function api(path: string, init?: RequestInit) {
  const response = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
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
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' }
type Channel = { id: string; name: string }

export default function AdminProductsList({ initial }: { initial: any }) {
  const firstRows = Array.isArray(initial) ? initial : initial?.rows || []
  const [rows, setRows] = useState<ProductRow[]>(firstRows)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState('updated_desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(Number(initial?.total || firstRows.length || 0))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  // How many products each view holds for the search, whichever view is open (lib/product-editor.ts).
  const [counts, setCounts] = useState<ProductViewCounts | null>(initial?.counts || null)
  // Active sales channels, for the Sales channels column (it said "Online Store" for every product).
  const [channels, setChannels] = useState<Channel[]>(initial?.channels || [])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const confirm = useConfirm()

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q, status, sort, page: String(nextPage), pageSize: String(pageSize) })
      const data = await api(`/api/admin/products?${params.toString()}`)
      setRows(data.rows || [])
      if (data.counts) setCounts(data.counts)
      if (Array.isArray(data.channels)) setChannels(data.channels)
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

  // The page arrives with the first page of the default view, so the first run loads nothing (it asked for the
  // same rows again on every visit); a change of view, sort or page size loads.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    void load(1)
  }, [status, sort, pageSize])

  const allSelected = rows.length > 0 && rows.every(product => selected.includes(product.id))

  function toggle(id: string) { setSelected(current => (current.includes(id) ? current.filter(value => value !== id) : [...current, id])) }
  function toggleAll() { setSelected(allSelected ? [] : rows.map(product => product.id)) }

  async function bulk(action: string) {
    if (!selected.length) return
    setLoading(true)
    setError('')
    setNotice('')
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

  async function deleteSelected() {
    const count = selected.length
    if (!count) return
    if (!await confirm({ title: `Delete ${count} product${count === 1 ? '' : 's'}?`, message: 'Products that appear in past orders are kept, and you will see their names. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' })) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const data = await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction: 'DELETE' }) })
      const deleted = Number(data.count || 0)
      const skipped: { name: string }[] = Array.isArray(data.skipped) ? data.skipped : []
      await load(page)
      const kept = skipped.length ? ` Kept ${skipped.length} because they appear in past orders (archive them instead): ${skipped.map(product => product.name).join(', ')}.` : ''
      setNotice(`${deleted} product${deleted === 1 ? '' : 's'} deleted.${kept}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  // Counted for every view at once; they were counted from the rows on screen, so on the Draft view Active read 0
  // and All read the Draft count.
  const views: Array<[keyof ProductViewCounts, string]> = [['ALL', 'All'], ['ACTIVE', 'Active'], ['DRAFT', 'Draft'], ['ARCHIVED', 'Archived']]
  const allCount = counts ? counts.ALL : total

  // The channels a product is on (lib/product-editor.ts). With no channel set up yet, the store itself still sells it.
  function channelCell(product: ProductRow) {
    if (!channels.length) return <span className={styles.channel}>Online Store</span>
    const on = channelsShowing(channels, product.publications || [])
    return on.length ? <span className={styles.channel}>{on.map(channel => channel.name).join(', ')}</span> : <span className={ui.muted}>Not on any channel</span>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Catalog</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Products</h1>
            <span className={styles.countPill}>{allCount.toLocaleString()}</span>
          </div>
        </div>
        <div className={styles.toolbar}>
          {/* The shared menu: opening it moves focus in, arrow keys move, Escape closes (components/admin-menu.tsx). */}
          <AdminMenu className={styles.actionMenu} buttonClassName={`${ui.btn} ${ui.btnSecondary}`} menuClassName={styles.menu} content={<>More tools <ChevronDown size={14} /></>}>
            <Link href="/admin/products/prices" role="menuitem"><Tag size={14} /> Change prices</Link>
            <Link href="/admin/products/import" role="menuitem"><Upload size={14} /> Import</Link>
            <button type="button" role="menuitem" onClick={() => setExportOpen(true)}><Download size={14} /> Export</button>
          </AdminMenu>
          <Link className={ui.btn} href="/admin/products/new"><Plus size={16} /> Add product</Link>
        </div>
      </div>
      {exportOpen && <ProductExportDialog onClose={() => setExportOpen(false)} total={total} selectedIds={selected} status={status} q={q} />}

      {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
      {notice && <div className={ui.alert} role="status">{notice}</div>}

      <div className={`${styles.viewBar} ${ui.card}`}>
        <div className={styles.views} role="tablist" aria-label="Product views">
          {views.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`}
              onClick={() => setStatus(value)}
            >
              <span>{label}</span><small>{(counts ? counts[value] : value === status ? total : 0).toLocaleString()}</small>
            </button>
          ))}
        </div>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}>
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
            <button className={`${ui.btn} ${ui.btnDanger}`} onClick={deleteSelected}><Trash2 size={15} /> Delete</button>
            <AdminMenu className={styles.actionMenu} buttonClassName={`${ui.btn} ${ui.btnSecondary}`} menuClassName={styles.menu} content={<>More <ChevronDown size={14} /></>}>
              <button type="button" role="menuitem" onClick={() => bulk('FEATURED_ON')}><Star size={14} /> Feature products</button>
              <button type="button" role="menuitem" onClick={() => bulk('FEATURED_OFF')}><StarOff size={14} /> Unfeature products</button>
              <button type="button" role="menuitem" onClick={() => setSelected([])}><X size={14} /> Clear selection</button>
            </AdminMenu>
          </div>
        </div>
      )}

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={styles.tableMeta}>
          <span>{total.toLocaleString()} {total === 1 ? 'product' : 'products'}</span>
          <label>Rows
            <select className={`${ui.input} ${ui.inputCompact}`} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
        <div className={ui.tableWrap}>
          <table className={`${styles.productTable} ${ui.cardTable}`}>
            <thead>
              <tr>
                <th><input aria-label="Select all products" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th>Product</th>
                <th>Status</th>
                <th>Inventory</th>
                <th>Price</th>
                <th>Sales channels</th>
                <th>Updated</th>
                <th className={styles.openHead}><span className={styles.srOnly}>Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(product => {
                const stock = stockInfo(product)
                return (
                  <tr key={product.id} className={selected.includes(product.id) ? styles.selectedRow : undefined}>
                    <td data-cell="check"><input aria-label={`Select ${product.name}`} type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} /></td>
                    <td data-cell="primary">
                      <Link className={styles.productCell} href={`/admin/products/${product.id}`}>
                        <div className={styles.thumb}>{product.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <span aria-hidden="true">◎</span>}</div>
                        <div><strong>{product.name}</strong><span>{product.sku || 'No SKU'}{product.featured ? ' · Featured' : ''}</span></div>
                      </Link>
                    </td>
                    <td data-label="Status"><span className={`${styles.status} ${statusClass[product.status] || ''}`}>{STATUS_LABEL[product.status] || product.status}</span></td>
                    <td data-label="Inventory">
                      {stock.tracked ? (
                        <div className={stock.available <= 5 ? `${styles.stock} ${styles.stockLow}` : styles.stock}>
                          <strong>{stock.available}</strong><span>{stock.reserved ? `${stock.reserved} reserved` : 'available'}</span>
                        </div>
                      ) : <span className={ui.muted}>Not tracked</span>}
                    </td>
                    <td data-label="Price"><strong>{money(product.basePrice)}</strong>{product.compareAtPrice ? <div className={`${ui.muted} strike`}>{money(product.compareAtPrice)}</div> : null}</td>
                    <td data-cell="hide">{channelCell(product)}</td>
                    <td data-label="Updated">{new Date(product.updatedAt).toLocaleDateString()}</td>
                    <td data-cell="hide"><Link className={ui.iconBtn} href={`/admin/products/${product.id}`} title="Open product" aria-label={`Open ${product.name}`}><MoreHorizontal size={17} /></Link></td>
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
            <button className={ui.iconBtn} aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16} /></button>
            <button className={ui.iconBtn} aria-label="Next page" disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
