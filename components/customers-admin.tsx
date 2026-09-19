'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Eye, Plus, Search, ShieldOff, Tag, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { money } from '@/lib/config'
import ui from './admin-ui.module.css'
import { useToast } from './admin-toast'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || '').join('') || '?'

export default function CustomersAdmin({ initial }: { initial: any }) {
  const toast = useToast()
  const [rows, setRows] = useState<any[]>(initial?.rows || [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [tag, setTag] = useState('')
  const [availableTags, setAvailableTags] = useState<any[]>(initial?.availableTags || [])
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
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  async function load(nextPage = 1) {
    setLoading(true); setError(''); setSelected([])
    try {
      const params = new URLSearchParams({ q, status, page: String(nextPage), pageSize: String(pageSize) })
      if (tag) params.set('tag', tag)
      const data = await api('/api/admin/customers?' + params.toString())
      setRows(data.rows || []); setPage(data.page || nextPage); setPages(data.pages || 1); setTotal(data.total || 0)
      setActiveCount(data.active || 0); setDisabledCount(data.disabled || 0)
      if (data.availableTags) setAvailableTags(data.availableTags)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load customers') }
    finally { setLoading(false) }
  }

  function toggleRow(id: string) { setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]) }
  function toggleAll() { setSelected(current => current.length === rows.length ? [] : rows.map(r => r.id)) }

  async function bulk(bulkAction: 'ACTIVATE' | 'DISABLE' | 'DELETE') {
    if (!selected.length) return
    if (bulkAction === 'DELETE' && !confirm(`Delete ${selected.length} customer${selected.length === 1 ? '' : 's'}? This permanently removes their accounts, addresses, reviews and loyalty history. Their past orders are kept but no longer linked to an account.`)) return
    const count = selected.length
    setBulkBusy(true)
    try {
      await api('/api/admin/customers', { method: 'POST', body: JSON.stringify({ action: 'bulk', ids: selected, bulkAction }) })
      await load(page)
      const verb = bulkAction === 'ACTIVATE' ? 'activated' : bulkAction === 'DISABLE' ? 'disabled' : 'deleted'
      toast(`${count} customer${count === 1 ? '' : 's'} ${verb}`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Unable to update customers', 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkTag() {
    if (!selected.length) return
    const value = window.prompt(`Tag ${selected.length} customer${selected.length === 1 ? '' : 's'} with:`)?.trim()
    if (!value) return
    const count = selected.length
    setBulkBusy(true)
    try {
      await api('/api/admin/customers/tags', { method: 'POST', body: JSON.stringify({ value, customerIds: selected }) })
      await load(page)
      toast(`Tagged ${count} customer${count === 1 ? '' : 's'} "${value}"`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Unable to tag customers', 'error') }
    finally { setBulkBusy(false) }
  }

  useEffect(() => { void load(1) }, [status, pageSize, tag])

  // Active/disabled come straight from the server so the tiles always reflect the true
  // totals for the current search, not just whichever page of rows happens to be loaded.
  const stats = useMemo(() => ({
    active: activeCount,
    disabled: disabledCount,
    repeat: rows.filter(x => x._count?.orders > 1).length,
  }), [rows, activeCount, disabledCount])

  async function createCustomer() {
    setLoading(true)
    try {
      await api('/api/admin/customers', { method: 'POST', body: JSON.stringify(form) })
      setShowCreate(false); setForm({ name: '', email: '', phone: '', password: '' }); await load(1)
      toast('Customer created')
    } catch (e) { toast(e instanceof Error ? e.message : 'Unable to create customer', 'error') }
    finally { setLoading(false) }
  }

  async function deleteCustomer(customer: { id: string; name: string }) {
    if (!confirm(`Delete ${customer.name}? This permanently removes their account, addresses, reviews and loyalty history. Their past orders are kept but no longer linked to an account.`)) return
    try {
      await api(`/api/admin/customers/${customer.id}`, { method: 'DELETE' })
      await load(page)
      toast('Customer deleted')
    } catch (e) { toast(e instanceof Error ? e.message : 'Unable to delete customer', 'error') }
  }

  return <div className="customersPage">
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>PEOPLE</span><h1 className={ui.title}>Customers</h1><p className={ui.muted}>See who buys from you, understand their history and manage customer accounts.</p></div>
      <button className={ui.btn} onClick={() => setShowCreate(true)}><Plus size={16}/> Add customer</button>
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className="catalogStats">
      <button className={status === 'ALL' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ALL')}><span className={ui.muted}>All customers</span><strong>{total}</strong></button>
      <button className={status === 'ACTIVE' ? 'statCard active' : 'statCard'} onClick={() => setStatus('ACTIVE')}><span className={ui.muted}>Active</span><strong>{stats.active}</strong></button>
      <button className={status === 'DISABLED' ? 'statCard active' : 'statCard'} onClick={() => setStatus('DISABLED')}><span className={ui.muted}>Disabled</span><strong>{stats.disabled}</strong></button>
      <div className="statCard"><span className={ui.muted}>Repeat customers on page</span><strong>{stats.repeat}</strong></div>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or phone…" onKeyDown={e => { if (e.key === 'Enter') void load(1) }}/><button className="searchClear" hidden={!q} onClick={() => { setQ(''); void load(1) }}><X size={14}/></button></div>
      <div className="catalogFilters open"><select className={ui.input} value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">All customers</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select><select className={ui.input} value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{availableTags.map((t: any) => <option key={t.id} value={t.value}>{t.value}</option>)}</select><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => load(1)} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button></div>
    </div>

    {selected.length > 0 && (
      <div className={ui.bulkBar}>
        <div className={ui.bulkCount}><strong>{selected.length}</strong><span> selected</span></div>
        <div className={ui.bulkActions}>
          <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulkTag()}><Tag size={15} /> Tag</button>
          <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('ACTIVATE')}><UserCheck size={15} /> Activate</button>
          <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DISABLE')}><ShieldOff size={15} /> Disable</button>
          <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={bulkBusy} onClick={() => bulk('DELETE')}><Trash2 size={15} /> Delete</button>
        </div>
      </div>
    )}

    <div className={`${ui.card} productTableCard`}>
      <div className="tableTopline"><span className={ui.muted}>{total.toLocaleString()} customers</span><label className={ui.muted}>Rows <select className={`${ui.input} ${ui.inputCompact}`} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option>25</option><option>50</option><option>100</option></select></label></div>
      <div className={ui.tableWrap}><table className={ui.table}><thead><tr><th><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={toggleAll} aria-label="Select all customers" /></th><th>Customer</th><th>Contact</th><th>Tags</th><th>Orders</th><th>Reviews</th><th>Spend</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>{rows.map(c => <tr key={c.id}>
        <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleRow(c.id)} aria-label={`Select ${c.name}`} /></td>
        <td><Link className="productListName" href={`/admin/customers/${c.id}`}><div className="customerAvatar">{initials(c.name)}</div><div><strong>{c.name}</strong><div className={ui.muted}>{c.email}</div></div></Link></td>
        <td><span>{c.phone || '—'}</span></td>
        <td><div className="inline" style={{ flexWrap: 'wrap', gap: 4 }}>{(c.tags || []).map((t: any) => <span className={ui.statusPill} key={t.id}>{t.value}</span>)}{!(c.tags || []).length && <span className={ui.muted}>—</span>}</div></td>
        <td><strong>{c._count?.orders || 0}</strong></td>
        <td>{c._count?.reviews || 0}</td>
        <td><strong>{money(c.totalSpent || 0)}</strong></td>
        <td><span className={c.isActive ? `${ui.statusPill} ${ui.statusPillSuccess}` : ui.statusPill}>{c.isActive ? <UserCheck size={13}/> : <UserX size={13}/>} {c.isActive ? 'Active' : 'Disabled'}</span></td>
        <td>{new Date(c.createdAt).toLocaleDateString()}</td>
        <td><div className="inline">
          <Link className={ui.iconBtn} href={`/admin/customers/${c.id}`} title="View customer"><Eye size={16}/></Link>
          <button className={ui.iconBtn} title="Delete customer" onClick={() => deleteCustomer(c)}><Trash2 size={16}/></button>
        </div></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <div className={ui.empty}>No customers match your search.</div>}
      <div className="catalogPagination"><span className={ui.muted}>Page {page} of {pages}</span><div className="inline"><button className={ui.iconBtn} disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16}/></button><button className={ui.iconBtn} disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16}/></button></div></div>
    </div>

    {showCreate && <div className={ui.modalOverlay} onClick={() => setShowCreate(false)}><div className={ui.card} style={{ width: 'min(520px, 92vw)', padding: 24 }} onClick={e => e.stopPropagation()}>
      <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><div><h2 className="h3">Add customer</h2><p className={ui.muted}>Create a customer profile without leaving the catalog.</p></div><button className={ui.iconBtn} onClick={() => setShowCreate(false)}><X size={16}/></button></div>
      <div className={ui.twoCol}><label className={ui.fieldLabel}>Name<input className={ui.input} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className={ui.fieldLabel}>Email<input className={ui.input} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label className={ui.fieldLabel}>Phone<input className={ui.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label><label className={ui.fieldLabel}>Password <span className={ui.fieldHelp}>Optional; can be added later.</span><input className={ui.input} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/></label></div>
      <div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setShowCreate(false)}>Cancel</button><button className={ui.btn} onClick={createCustomer} disabled={loading || !form.name.trim() || !form.email.trim()}>{loading ? 'Creating…' : 'Create customer'}</button></div>
    </div></div>}
  </div>
}
