'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Star, Tag, X } from 'lucide-react'
import { money } from '@/lib/config'

type ProductRow = any

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
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

const styles = `
.shopifyCatalogPage{max-width:1480px;margin:0 auto;padding-bottom:24px}
.shopifyCatalogHeader{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}
.shopifyEyebrow{font-size:11px;letter-spacing:.09em;font-weight:700;color:#777770;margin-bottom:4px}
.shopifyTitleRow{display:flex;align-items:center;gap:10px}.shopifyTitle{margin:0;font-size:38px;letter-spacing:-.045em}.shopifyCountPill{display:inline-flex;align-items:center;height:28px;padding:0 9px;border-radius:999px;background:#ecece8;color:#55554f;font-size:12px;font-weight:700}
.shopifyViewBar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px;margin-bottom:12px;overflow:visible}.shopifyViews{display:flex;align-items:center;gap:2px;overflow:auto}.shopifyView{display:flex;align-items:center;gap:8px;border:0;background:transparent;padding:10px 13px;border-radius:8px;color:#66665f;font:inherit;font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer}.shopifyView small{font-size:11px;color:#91918a}.shopifyView:hover{background:#f3f3ef;color:#171717}.shopifyView.active{background:#171717;color:#fff}.shopifyView.active small{color:#d8d8d2}
.compactBtn{min-height:38px!important}.rotate180{transform:rotate(180deg)}
.shopifyFilterBar{padding:10px 12px;margin-bottom:12px}.shopifySearch{display:flex;align-items:center;gap:9px;height:42px;padding:0 12px;border:1px solid #dfdfd8;border-radius:10px;background:#fff;color:#77776f}.shopifySearch:focus-within{border-color:#9a9a92;box-shadow:0 0 0 3px rgba(23,23,23,.05)}.shopifySearch input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;color:#1a1a18}.shopifySearch button{border:0;background:transparent;color:#7a7a73;display:grid;place-items:center;cursor:pointer}
.shopifyFilterGrid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid #ededeb}.shopifyFilterGrid label{display:grid;gap:6px;font-size:11px;color:#77776f;font-weight:650}
.shopifyBulkBar{position:sticky;top:78px;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;margin-bottom:12px;border:1px solid #d7d7d0;border-radius:12px;background:#fff;box-shadow:0 8px 20px rgba(0,0,0,.06)}.shopifyBulkBar>div:first-child{font-size:13px}.shopifyBulkBar>div:first-child span{color:#6a6a64}.shopifyBulkActions{display:flex;align-items:center;gap:7px}.shopifyActionMenu{position:relative}.shopifyMenu{position:absolute;right:0;top:calc(100% + 6px);min-width:190px;padding:6px;border:1px solid #deded8;border-radius:10px;background:#fff;box-shadow:0 10px 25px rgba(0,0,0,.12);z-index:30}.shopifyMenu button{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border:0;border-radius:7px;background:transparent;text-align:left;font:inherit;font-size:13px;color:#383833;cursor:pointer}.shopifyMenu button:hover{background:#f4f4f0}
.shopifyTableCard{overflow:hidden}.shopifyTableMeta{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #ededeb;font-size:13px;color:#6b6b65}.shopifyTableMeta label{display:flex;align-items:center;gap:7px;font-size:12px}.shopifyProductTable{min-width:1050px}.shopifyProductTable th{background:#fbfbf9;padding:12px 14px;border-bottom:1px solid #e8e8e3;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#77776f}.shopifyProductTable td{padding:11px 14px;height:70px;vertical-align:middle}.shopifyProductTable tbody tr:hover{background:#fcfcfa}.shopifyProductTable tbody tr.selectedRow{background:#f1f1ed}
.shopifyProductCell{display:flex;align-items:center;gap:11px;min-width:285px;text-decoration:none;color:inherit}.shopifyProductCell strong{display:block;font-size:13px;color:#171717}.shopifyProductCell span{display:block;margin-top:3px;font-size:11px;color:#7b7b73}.shopifyThumb{width:46px;height:46px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:9px;background:#f1f1ed;color:#999;font-size:20px}.shopifyThumb img{width:100%;height:100%;object-fit:cover}.shopifyStatus{display:inline-flex;align-items:center;min-height:26px;padding:0 8px;border-radius:999px;font-size:10px;font-weight:750;letter-spacing:.02em;text-transform:capitalize}.shopifyStatus.active{background:#e8f5eb;color:#176b35}.shopifyStatus.draft{background:#f1f1ee;color:#62625c}.shopifyStatus.archived{background:#ececef;color:#55555d}.shopifyStock{display:grid;gap:2px}.shopifyStock strong{font-size:13px}.shopifyStock span{font-size:10px;color:#77776f}.shopifyStock.low strong{color:#a53b2f}.shopifyChannel{display:inline-flex;padding:5px 8px;border:1px solid #e1e1db;border-radius:7px;font-size:10px;color:#55554f;background:#fff}.shopifyTableCard .catalogPagination{background:#fff}
@media(max-width:900px){.shopifyCatalogHeader{align-items:flex-start}.shopifyFilterGrid{grid-template-columns:1fr}.shopifyBulkBar{position:relative;top:auto;align-items:flex-start;flex-direction:column}.shopifyBulkActions{flex-wrap:wrap}.shopifyViews{max-width:100%}}
@media(max-width:600px){.shopifyCatalogHeader{flex-direction:column}.shopifyCatalogHeader>.btn{width:100%;justify-content:center}.shopifyTitle{font-size:32px}.shopifyViewBar{align-items:stretch;flex-direction:column}.compactBtn{width:100%}.shopifyViews{width:100%}.shopifyView{flex:1;justify-content:center}.shopifyProductTable{min-width:980px}}
`

export default function ProductListAdminShopify({ initial }: { initial: any }) {
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

  useEffect(() => { api('/api/admin/categories').then(data => setCategories(Array.isArray(data) ? data : data.rows || data.categories || [])).catch(() => undefined) }, [])

  async function load(nextPage = page) {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ q, status, categoryId, sort, page: String(nextPage), pageSize: String(pageSize) })
      const data = await api(`/api/admin/products?${params.toString()}`)
      setRows(data.rows || []); setTotal(Number(data.total || 0)); setPages(Number(data.pages || 1)); setPage(Number(data.page || nextPage)); setSelected([])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load products') } finally { setLoading(false) }
  }

  useEffect(() => { void load(1) }, [status, categoryId, sort, pageSize])

  const allSelected = rows.length > 0 && rows.every(product => selected.includes(product.id))
  const draftCount = useMemo(() => rows.filter(product => product.status === 'DRAFT').length, [rows])
  const activeCount = useMemo(() => rows.filter(product => product.status === 'ACTIVE').length, [rows])
  const archivedCount = useMemo(() => rows.filter(product => product.status === 'ARCHIVED').length, [rows])

  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]) }
  function toggleAll() { setSelected(allSelected ? [] : rows.map(product => product.id)) }

  async function bulk(action: string) {
    if (!selected.length) return
    setLoading(true); setError(''); setNotice(''); setBulkOpen(false)
    try {
      const data = await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction: action }) })
      const count = Number(data.count || selected.length); setNotice(`${count} product${count === 1 ? '' : 's'} updated`); await load(page)
    } catch (e) { setError(e instanceof Error ? e.message : 'Bulk action failed') } finally { setLoading(false) }
  }

  const views = [['ALL','All',total],['ACTIVE','Active',activeCount],['DRAFT','Draft',draftCount],['ARCHIVED','Archived',archivedCount]] as const

  return <>
    <style>{styles}</style>
    <div className="shopifyCatalogPage">
      <div className="shopifyCatalogHeader"><div><div className="shopifyEyebrow">CATALOG</div><div className="shopifyTitleRow"><h1 className="shopifyTitle">Products</h1><span className="shopifyCountPill">{total.toLocaleString()}</span></div></div><Link className="btn" href="/admin/products/new"><Plus size={16}/> Add product</Link></div>
      {error && <div className="alert danger">{error}</div>}{notice && <div className="alert">{notice}</div>}
      <div className="shopifyViewBar card"><div className="shopifyViews" role="tablist" aria-label="Product views">{views.map(([value,label,count]) => <button key={value} type="button" role="tab" aria-selected={status===value} className={status===value?'shopifyView active':'shopifyView'} onClick={() => setStatus(value)}><span>{label}</span><small>{count.toLocaleString()}</small></button>)}</div><button type="button" className="btn secondary compactBtn" onClick={() => setFiltersOpen(value=>!value)}>Filters <ChevronDown className={filtersOpen?'rotate180':''} size={15}/></button></div>
      <div className="card shopifyFilterBar"><div className="shopifySearch"><Search size={16}/><input value={q} onChange={event=>setQ(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void load(1)}} placeholder="Search products" aria-label="Search products"/>{q && <button type="button" onClick={()=>{setQ('');void load(1)}} aria-label="Clear search"><X size={14}/></button>}</div>{filtersOpen && <div className="shopifyFilterGrid"><label><span>Category</span><select className="input" value={categoryId} onChange={event=>setCategoryId(event.target.value)}><option value="ALL">All categories</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label><span>Sort</span><select className="input" value={sort} onChange={event=>setSort(event.target.value)}><option value="updated_desc">Recently updated</option><option value="created_desc">Newest</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="price_asc">Price low–high</option><option value="price_desc">Price high–low</option></select></label><button type="button" className="btn secondary" onClick={()=>load(1)} disabled={loading}>{loading?'Loading…':'Apply filters'}</button></div>}</div>
      {selected.length>0 && <div className="shopifyBulkBar"><div><strong>{selected.length}</strong><span> selected</span></div><div className="shopifyBulkActions"><button className="btn secondary" onClick={()=>bulk('ACTIVE')}><CheckCircle2 size={15}/> Activate</button><button className="btn secondary" onClick={()=>bulk('DRAFT')}><Tag size={15}/> Draft</button><button className="btn secondary" onClick={()=>bulk('ARCHIVED')}><Archive size={15}/> Archive</button><div className="shopifyActionMenu"><button className="btn secondary" onClick={()=>setBulkOpen(value=>!value)}>More <ChevronDown size={14}/></button>{bulkOpen && <div className="shopifyMenu"><button onClick={()=>bulk('FEATURED_ON')}><Star size={14}/> Feature products</button><button onClick={()=>setSelected([])}><X size={14}/> Clear selection</button></div>}</div></div></div>}
      <div className="card shopifyTableCard"><div className="shopifyTableMeta"><span>{total.toLocaleString()} products</span><label>Rows <select className="input compact" value={pageSize} onChange={event=>setPageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="tableWrap"><table className="table shopifyProductTable"><thead><tr><th><input aria-label="Select all products" type="checkbox" checked={allSelected} onChange={toggleAll}/></th><th>Product</th><th>Status</th><th>Inventory</th><th>Category</th><th>Price</th><th>Sales channels</th><th>Updated</th><th/></tr></thead><tbody>{rows.map(product=>{const stock=stockInfo(product);return <tr key={product.id} className={selected.includes(product.id)?'selectedRow':''}><td><input aria-label={`Select ${product.name}`} type="checkbox" checked={selected.includes(product.id)} onChange={()=>toggle(product.id)}/></td><td><Link className="shopifyProductCell" href={`/admin/products/${product.id}`}><div className="shopifyThumb">{product.images?.[0]?.url?<img src={product.images[0].url} alt=""/>:<span aria-hidden="true">◎</span>}</div><div><strong>{product.name}</strong><span>{product.sku||'No SKU'}{product.featured?' · Featured':''}</span></div></Link></td><td><span className={`shopifyStatus ${String(product.status).toLowerCase()}`}>{product.status}</span></td><td>{stock.tracked?<div className={stock.available<=5?'shopifyStock low':'shopifyStock'}><strong>{stock.available}</strong><span>{stock.reserved?`${stock.reserved} reserved`:'available'}</span></div>:<span className="muted">Not tracked</span>}</td><td>{product.category?.name||'—'}</td><td><strong>{money(product.basePrice)}</strong>{product.compareAtPrice?<div className="muted strike">{money(product.compareAtPrice)}</div>:null}</td><td><span className="shopifyChannel">Online Store</span></td><td>{new Date(product.updatedAt).toLocaleDateString()}</td><td><Link className="iconBtn" href={`/admin/products/${product.id}`} title="Open product"><MoreHorizontal size={17}/></Link></td></tr>})}</tbody></table></div>{!rows.length&&<div className="empty">No products match your current view.</div>}<div className="catalogPagination"><span className="muted">Page {page} of {pages}</span><div className="inline"><button className="iconBtn" disabled={page<=1||loading} onClick={()=>load(page-1)}><ChevronLeft size={16}/></button><button className="iconBtn" disabled={page>=pages||loading} onClick={()=>load(page+1)}><ChevronRight size={16}/></button></div></div></div>
    </div>
  </>
}
