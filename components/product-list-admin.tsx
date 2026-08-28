'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Star, Tag, X } from 'lucide-react'
import { money } from '@/lib/config'

type ProductRow = any

function adminImageUrl(raw: unknown) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('/') || value.startsWith('data:') || value.startsWith('blob:')) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return value
    if (url.hostname === 'drive.google.com') {
      const id = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id')
      if (id) return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}`
    }
    if (url.hostname.endsWith('dropbox.com')) {
      url.searchParams.set('dl', '1')
      return `/api/image-proxy?url=${encodeURIComponent(url.toString())}`
    }
    return `/api/image-proxy?url=${encodeURIComponent(value)}`
  } catch {
    return value
  }
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

function stockInfo(p: ProductRow) {
  const rows = p.inventory || []
  const direct = rows.filter((x: any) => !x.variantId)
  const variantRows = (p.variants || []).flatMap((v: any) => v.inventory || [])
  const source = direct.length ? direct : variantRows
  const available = source.reduce((sum: number, x: any) => sum + Number(x.quantity || 0) - Number(x.reserved || 0), 0)
  const reserved = source.reduce((sum: number, x: any) => sum + Number(x.reserved || 0), 0)
  const tracked = Boolean(p.trackInventory)
  return { available: Math.max(0, available), reserved, tracked }
}

export default function ProductListAdmin({ initial }: { initial: any }) {
  const initialRows = Array.isArray(initial) ? initial : initial?.rows || []
  const [rows, setRows] = useState<ProductRow[]>(initialRows)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [categoryId, setCategoryId] = useState('ALL')
  const [sort, setSort] = useState('updated_desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(Number(initial?.total || initialRows.length || 0))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  const [categories, setCategories] = useState<any[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileFilter, setMobileFilter] = useState(false)

  useEffect(() => {
    api('/api/admin/categories').then(data => setCategories(Array.isArray(data) ? data : data.rows || data.categories || [])).catch(() => undefined)
  }, [])

  async function load(nextPage = page) {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ q, status, categoryId, sort, page: String(nextPage), pageSize: String(pageSize) })
      const data = await api('/api/admin/products?' + params.toString())
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setPage(data.page || nextPage)
      setSelected([])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load products') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(1) }, [status, categoryId, sort, pageSize])

  const allSelected = rows.length > 0 && rows.every(p => selected.includes(p.id))
  const activeCount = useMemo(() => rows.filter(p => p.status === 'ACTIVE').length, [rows])
  const draftCount = useMemo(() => rows.filter(p => p.status === 'DRAFT').length, [rows])
  const lowCount = useMemo(() => rows.filter(p => { const s = stockInfo(p); return s.tracked && s.available <= 5 }).length, [rows])

  function toggle(id: string) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]) }
  function toggleAll() { setSelected(allSelected ? [] : rows.map(p => p.id)) }

  async function bulk(action: string) {
    if (!selected.length) return
    setLoading(true); setError(''); setNotice('')
    try {
      const data = await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction: action }) })
      setNotice(`${data.count || selected.length} product${(data.count || selected.length) === 1 ? '' : 's'} updated`)
      await load(page)
    } catch (e) { setError(e instanceof Error ? e.message : 'Bulk action failed') }
    finally { setLoading(false) }
  }

  return <div className="catalogPage">
    <div className="sectionHead catalogHead"><div><span className="muted">CATALOG</span><h1 className="h2">Products</h1><p className="muted">Manage your entire catalog, inventory, variants, merchandising and SEO.</p></div><div className="inline"><Link className="btn" href="/admin/products/new"><Plus size={16}/> Add product</Link></div></div>
    {error && <div className="alert danger">{error}</div>}{notice && <div className="alert">{notice}</div>}
    <div className="catalogStats"><button className={status === 'ALL' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ALL')}><span className="muted">All products</span><strong>{total}</strong></button><button className={status === 'ACTIVE' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ACTIVE')}><span className="muted">Active</span><strong>{activeCount}</strong></button><button className={status === 'DRAFT' ? 'statCard active' : 'statCard'} onClick={() => setStatus('DRAFT')}><span className="muted">Drafts</span><strong>{draftCount}</strong></button><button className="statCard" onClick={() => setStatus('ALL')}><span className="muted">Low stock in page</span><strong>{lowCount}</strong></button></div>
    <div className="card catalogToolbar"><div className="productSearch"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(1) }} placeholder="Search products, SKUs, vendors…"/><button type="button" className="searchClear" hidden={!q} onClick={() => { setQ(''); void load(1) }}><X size={14}/></button></div><button type="button" className="btn secondary mobileFilterBtn" onClick={() => setMobileFilter(v => !v)}>Filters <ChevronDown size={15}/></button><div className={mobileFilter ? 'catalogFilters open' : 'catalogFilters'}><select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="ALL">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="input" value={sort} onChange={e => setSort(e.target.value)}><option value="updated_desc">Recently updated</option><option value="created_desc">Newest</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="price_asc">Price low–high</option><option value="price_desc">Price high–low</option></select><button type="button" className="btn secondary" onClick={() => load(1)} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button></div></div>
    {selected.length > 0 && <div className="bulkBar"><strong>{selected.length} selected</strong><div className="inline"><button className="btn secondary" onClick={() => bulk('ACTIVE')}><CheckCircle2 size={15}/> Activate</button><button className="btn secondary" onClick={() => bulk('DRAFT')}><Tag size={15}/> Draft</button><button className="btn secondary" onClick={() => bulk('ARCHIVED')}><Archive size={15}/> Archive</button><button className="btn secondary" onClick={() => bulk('FEATURED_ON')}><Star size={15}/> Feature</button><button className="iconBtn" onClick={() => setSelected([])}><X size={16}/></button></div></div>}
    <div className="card productTableCard"><div className="tableTopline"><span className="muted">{total.toLocaleString()} products</span><div className="inline"><label className="muted">Rows <select className="input compact" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div></div><div className="tableWrap"><table className="table productTable"><thead><tr><th><input aria-label="Select all products" type="checkbox" checked={allSelected} onChange={toggleAll}/></th><th>Product</th><th>Status</th><th>Inventory</th><th>Category</th><th>Price</th><th>Sales channels</th><th>Updated</th><th></th></tr></thead><tbody>{rows.map(p => { const s = stockInfo(p); const featured = Boolean(p.featured); const sourceImage = p.images?.[0]?.url || ''; const image = adminImageUrl(sourceImage); return <tr key={p.id} className={selected.includes(p.id) ? 'selectedRow' : ''}><td><input aria-label={`Select ${p.name}`} type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}/></td><td><Link className="productListName" href={`/admin/products/${p.id}`}><div className="productThumb">{image ? <img src={image} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('isHidden') }} /> : null}<span className={image ? 'thumbFallback isHidden' : 'thumbFallback'} aria-hidden="true">◎</span></div><div><strong>{p.name}</strong><div className="muted">{p.sku}{featured ? <span className="featuredDot"> · Featured</span> : ''}</div></div></Link></td><td><span className={`statusPill ${String(p.status).toLowerCase()}`}>{p.status === 'ACTIVE' ? <CheckCircle2 size={13}/> : p.status === 'DRAFT' ? <Tag size={13}/> : <Archive size={13}/>} {p.status}</span></td><td><div className={s.available <= 5 && s.tracked ? 'stockCell low' : 'stockCell'}>{s.tracked ? <><strong>{s.available}</strong><span className="muted">{s.reserved ? `${s.reserved} reserved` : 'available'}</span></> : <span className="muted">Not tracked</span>}</div></td><td>{p.category?.name || '—'}</td><td><strong>{money(p.basePrice)}</strong>{p.compareAtPrice ? <div className="muted strike">{money(p.compareAtPrice)}</div> : null}</td><td><span className="pill">Online Store</span></td><td>{new Date(p.updatedAt).toLocaleDateString()}</td><td><Link className="iconBtn" href={`/admin/products/${p.id}`} title="Open product"><MoreHorizontal size={17}/></Link></td></tr>})}</tbody></table></div>{!rows.length && <div className="empty">No products match your filters.</div>}<div className="catalogPagination"><span className="muted">Page {page} of {pages}</span><div className="inline"><button className="iconBtn" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16}/></button><button className="iconBtn" disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16}/></button></div></div></div>
  </div>
}
