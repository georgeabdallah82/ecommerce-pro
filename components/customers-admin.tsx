'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Eye, Plus, Search, UserCheck, UserX, X } from 'lucide-react'
import { money } from '@/lib/config'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || '').join('') || '?'

export default function CustomersAdmin({ initial }: { initial: any }) {
  const [rows, setRows] = useState<any[]>(initial?.rows || [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(Number(initial?.page || 1))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  const [total, setTotal] = useState(Number(initial?.total || 0))
  const [activeCount, setActiveCount] = useState(Number(initial?.active || 0))
  const [disabledCount, setDisabledCount] = useState(Number(initial?.disabled || 0))
  const [pageSize, setPageSize] = useState(Number(initial?.pageSize || 25))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })

  async function load(nextPage = 1) {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ q, status, page: String(nextPage), pageSize: String(pageSize) })
      const data = await api('/api/admin/customers?' + params.toString())
      setRows(data.rows || []); setPage(data.page || nextPage); setPages(data.pages || 1); setTotal(data.total || 0)
      setActiveCount(data.active || 0); setDisabledCount(data.disabled || 0)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load customers') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(1) }, [status, pageSize])

  // Active/disabled come straight from the server so the tiles always reflect the true
  // totals for the current search, not just whichever page of rows happens to be loaded.
  const stats = useMemo(() => ({
    active: activeCount,
    disabled: disabledCount,
    repeat: rows.filter(x => x._count?.orders > 1).length,
  }), [rows, activeCount, disabledCount])

  async function createCustomer() {
    setLoading(true); setError('')
    try {
      await api('/api/admin/customers', { method: 'POST', body: JSON.stringify(form) })
      setShowCreate(false); setForm({ name: '', email: '', phone: '', password: '' }); await load(1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create customer') }
    finally { setLoading(false) }
  }

  return <div className="customersPage">
    <div className="sectionHead">
      <div><span className="muted">PEOPLE</span><h1 className="h2">Customers</h1><p className="muted">See who buys from you, understand their history and manage customer accounts.</p></div>
      <button className="btn" onClick={() => setShowCreate(true)}><Plus size={16}/> Add customer</button>
    </div>

    {error && <div className="alert danger">{error}</div>}

    <div className="catalogStats">
      <button className={status === 'ALL' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ALL')}><span className="muted">All customers</span><strong>{total}</strong></button>
      <button className={status === 'ACTIVE' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ACTIVE')}><span className="muted">Active</span><strong>{stats.active}</strong></button>
      <button className={status === 'DISABLED' ? 'statCard active' : 'statCard'} onClick={() => setStatus('DISABLED')}><span className="muted">Disabled</span><strong>{stats.disabled}</strong></button>
      <div className="statCard"><span className="muted">Repeat customers on page</span><strong>{stats.repeat}</strong></div>
    </div>

    <div className="card catalogToolbar">
      <div className="productSearch"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or phone…" onKeyDown={e => { if (e.key === 'Enter') void load(1) }}/><button className="searchClear" hidden={!q} onClick={() => { setQ(''); void load(1) }}><X size={14}/></button></div>
      <div className="catalogFilters open"><select className="input" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">All customers</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select><button className="btn secondary" onClick={() => load(1)} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button></div>
    </div>

    <div className="card productTableCard">
      <div className="tableTopline"><span className="muted">{total.toLocaleString()} customers</span><label className="muted">Rows <select className="input compact" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option>25</option><option>50</option><option>100</option></select></label></div>
      <div className="tableWrap"><table className="table"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Reviews</th><th>Spend</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>{rows.map(c => <tr key={c.id}>
        <td><Link className="productListName" href={`/admin/customers/${c.id}`}><div className="customerAvatar">{initials(c.name)}</div><div><strong>{c.name}</strong><div className="muted">{c.email}</div></div></Link></td>
        <td><span>{c.phone || '—'}</span></td>
        <td><strong>{c._count?.orders || 0}</strong></td>
        <td>{c._count?.reviews || 0}</td>
        <td><strong>{money(c.totalSpent || 0)}</strong></td>
        <td><span className={c.isActive ? 'statusPill active' : 'statusPill archived'}>{c.isActive ? <UserCheck size={13}/> : <UserX size={13}/>} {c.isActive ? 'Active' : 'Disabled'}</span></td>
        <td>{new Date(c.createdAt).toLocaleDateString()}</td>
        <td><Link className="iconBtn" href={`/admin/customers/${c.id}`} title="View customer"><Eye size={16}/></Link></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <div className="empty">No customers match your search.</div>}
      <div className="catalogPagination"><span className="muted">Page {page} of {pages}</span><div className="inline"><button className="iconBtn" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16}/></button><button className="iconBtn" disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16}/></button></div></div>
    </div>

    {showCreate && <div className="modalOverlay" onClick={() => setShowCreate(false)}><div className="card" style={{ width: 'min(520px, 92vw)', padding: 24 }} onClick={e => e.stopPropagation()}>
      <div className="sectionHead small"><div><h2 className="h3">Add customer</h2><p className="muted">Create a customer profile without leaving the catalog.</p></div><button className="iconBtn" onClick={() => setShowCreate(false)}><X size={16}/></button></div>
      <div className="twoColFields"><label className="fieldLabel">Name<input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className="fieldLabel">Email<input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label className="fieldLabel">Phone<input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label><label className="fieldLabel">Password <span className="fieldHelp">Optional; can be added later.</span><input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/></label></div>
      <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="btn secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn" onClick={createCustomer} disabled={loading || !form.name.trim() || !form.email.trim()}>{loading ? 'Creating…' : 'Create customer'}</button></div>
    </div></div>}
  </div>
}
