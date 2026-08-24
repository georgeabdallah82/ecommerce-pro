'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, RefreshCw, Search, Truck, X } from 'lucide-react'
import { money } from '@/lib/config'
import { canTransitionOrder } from '@/lib/orders'

type Order = any
type Modal = { type: 'cancel' | 'refund' | 'tracking'; order: Order } | null
const statuses = ['PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED'] as const

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

function tabCount(rows: Order[], tab: string) {
  if (tab === 'all') return rows.length
  if (tab === 'unfulfilled') return rows.filter(o => !['SHIPPED','DELIVERED','CANCELLED','REFUNDED'].includes(o.status)).length
  if (tab === 'unpaid') return rows.filter(o => ['UNPAID','PENDING'].includes(o.paymentStatus)).length
  if (tab === 'fulfilled') return rows.filter(o => ['SHIPPED','DELIVERED'].includes(o.status)).length
  if (tab === 'cancelled') return rows.filter(o => ['CANCELLED','REFUNDED'].includes(o.status)).length
  return 0
}

function matchesTab(o: Order, tab: string) {
  if (tab === 'all') return true
  if (tab === 'unfulfilled') return !['SHIPPED','DELIVERED','CANCELLED','REFUNDED'].includes(o.status)
  if (tab === 'unpaid') return ['UNPAID','PENDING'].includes(o.paymentStatus)
  if (tab === 'fulfilled') return ['SHIPPED','DELIVERED'].includes(o.status)
  if (tab === 'cancelled') return ['CANCELLED','REFUNDED'].includes(o.status)
  return true
}

export function OrdersAdminPro({ initial }: { initial: Order[] }) {
  const [rows, setRows] = useState<Order[]>(initial || [])
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCompany, setTrackingCompany] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(o => {
      const text = `${o.orderNumber || ''} ${o.email || ''} ${o.phone || ''} ${o.user?.name || ''}`.toLowerCase()
      return (!needle || text.includes(needle)) && (!filter || o.status === filter) && matchesTab(o, tab)
    })
  }, [rows, q, tab, filter])

  const stats = useMemo(() => ({
    total: rows.length,
    unfulfilled: tabCount(rows, 'unfulfilled'),
    unpaid: tabCount(rows, 'unpaid'),
    fulfilled: tabCount(rows, 'fulfilled'),
    cancelled: tabCount(rows, 'cancelled'),
    revenue: rows.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0),
  }), [rows])

  const allShownSelected = shown.length > 0 && shown.every(o => selected.includes(o.id))

  async function refresh() {
    setError(''); setNotice('')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (filter) params.set('status', filter)
      const data = await api(`/api/admin/orders?${params.toString()}`)
      setRows(Array.isArray(data) ? data : data.rows || [])
      setSelected([])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load orders') }
  }

  async function update(id: string, data: any, message = 'Order updated.') {
    setBusy(id); setError(''); setNotice('')
    try {
      await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, ...data }) })
      await refresh()
      setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update order') }
    finally { setBusy(null) }
  }

  function openTracking(order: Order) {
    setTrackingNumber(order.trackingNumber || '')
    setTrackingCompany(order.trackingCompany || '')
    setModal({ type: 'tracking', order })
  }

  async function saveTracking() {
    if (!modal || modal.type !== 'tracking') return
    await update(modal.order.id, { trackingNumber: trackingNumber.trim(), trackingCompany: trackingCompany.trim() || null }, 'Tracking information saved.')
    setModal(null)
  }

  async function cancelOrder() {
    if (!modal || modal.type !== 'cancel') return
    await update(modal.order.id, { status: 'CANCELLED' }, 'Order cancelled. Any remaining reservation has been released.')
    setModal(null)
  }

  async function refundOrder() {
    if (!modal || modal.type !== 'refund') return
    const amount = Math.round(Number(refundAmount) * 100)
    const max = Number(modal.order.grandTotal || 0)
    if (!Number.isInteger(amount) || amount <= 0 || amount > max) {
      setError(`Refund must be between 0.01 and ${money(max, modal.order.currency)}`)
      return
    }
    setBusy(modal.order.id); setError(''); setNotice('')
    try {
      await api('/api/admin/refunds', { method: 'POST', body: JSON.stringify({ orderId: modal.order.id, amount, reason: 'Admin refund' }) })
      await refresh()
      setModal(null); setRefundAmount(''); setNotice('Refund issued successfully.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refund order') }
    finally { setBusy(null) }
  }

  async function bulkStatus(status: string) {
    if (!selected.length) return
    setBusy('bulk'); setError(''); setNotice('')
    try {
      for (const id of selected) await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) })
      await refresh()
      setNotice(`${selected.length} order${selected.length === 1 ? '' : 's'} updated.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update selected orders') }
    finally { setBusy(null) }
  }

  return <div className="ordersProPage catalogPage">
    <div className="sectionHead catalogHead">
      <div>
        <span className="muted">COMMERCE</span>
        <h1 className="h2">Orders</h1>
        <p className="muted">Manage orders, fulfillment, payments, tracking and refunds.</p>
      </div>
      <div className="inline">
        <button className="btn secondary" onClick={refresh} disabled={busy !== null}><RefreshCw size={15}/> Refresh</button>
        <Link className="btn" href="/admin/orders/new"><Plus size={15}/> Create order</Link>
      </div>
    </div>

    {(error || notice) && <div className={error ? 'alert danger' : 'alert'}>{error || notice}</div>}

    <div className="catalogStats">
      <button className={`statCard ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}><span>Total orders</span><strong>{stats.total}</strong></button>
      <button className={`statCard ${tab === 'unfulfilled' ? 'active' : ''}`} onClick={() => setTab('unfulfilled')}><span>Unfulfilled</span><strong>{stats.unfulfilled}</strong></button>
      <button className={`statCard ${tab === 'unpaid' ? 'active' : ''}`} onClick={() => setTab('unpaid')}><span>Unpaid</span><strong>{stats.unpaid}</strong></button>
      <button className={`statCard ${tab === 'fulfilled' ? 'active' : ''}`} onClick={() => setTab('fulfilled')}><span>Fulfilled</span><strong>{stats.fulfilled}</strong></button>
    </div>

    <div className="card orderViews">
      {['all','unfulfilled','unpaid','fulfilled','cancelled'].map(v => <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{v[0].toUpperCase() + v.slice(1)} <span>{tabCount(rows, v)}</span></button>)}
    </div>

    <div className="card catalogToolbar orderToolbar">
      <div className="productSearch"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && refresh()} placeholder="Search orders, customers, email…"/><button className="searchClear" hidden={!q} onClick={() => setQ('')}><X size={14}/></button></div>
      <select className="input" value={filter} onChange={e => { setFilter(e.target.value); setTimeout(refresh, 0) }}><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
      <span className="orderRevenue">{money(stats.revenue)}</span>
    </div>

    {selected.length > 0 && <div className="bulkBar">
      <div className="inline"><strong>{selected.length} selected</strong><button className="btn ghost smallBtn" onClick={() => setSelected([])}>Clear</button></div>
      <div className="inline">
        <button className="btn ghost smallBtn" disabled={busy === 'bulk'} onClick={() => bulkStatus('PROCESSING')}>Mark processing</button>
        <button className="btn ghost smallBtn" disabled={busy === 'bulk'} onClick={() => bulkStatus('SHIPPED')}>Mark shipped</button>
        <button className="btn ghost smallBtn" disabled={busy === 'bulk'} onClick={() => bulkStatus('CANCELLED')}>Cancel</button>
      </div>
    </div>}

    <div className="card productTableCard">
      <div className="tableTopline"><span className="muted">{shown.length} order{shown.length === 1 ? '' : 's'}</span><span className="muted">Revenue {money(stats.revenue)}</span></div>
      <div className="tableWrap"><table className="table productTable ordersTable"><thead><tr><th><input aria-label="Select all" type="checkbox" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? selected.filter(id => !shown.some(o => o.id === id)) : [...new Set([...selected, ...shown.map(o => o.id)])])}/></th><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th></th></tr></thead>
        <tbody>{shown.map(o => {
          const canCancel = canTransitionOrder(o.status, 'CANCELLED')
          const isSelected = selected.includes(o.id)
          return <tr key={o.id} className={isSelected ? 'selectedRow' : ''}>
            <td><input aria-label={`Select order ${o.orderNumber}`} type="checkbox" checked={isSelected} onChange={() => setSelected(current => current.includes(o.id) ? current.filter(id => id !== o.id) : [...current, o.id])}/></td>
            <td><Link className="textLink" href={`/admin/orders/${o.id}`}><strong>#{o.orderNumber}</strong></Link><div className="muted">{new Date(o.createdAt).toLocaleString()}</div></td>
            <td><strong>{o.user?.name || 'Guest'}</strong><div className="muted">{o.email}</div></td>
            <td>{(o.items || []).reduce((a: number, x: any) => a + x.quantity, 0)}</td>
            <td><strong>{money(o.grandTotal, o.currency)}</strong></td>
            <td><span className="statusPill">{o.paymentStatus}</span><div className="muted">{o.paymentMethod}</div></td>
            <td><span className={`statusPill ${['SHIPPED','DELIVERED'].includes(o.status) ? 'success' : o.status === 'CANCELLED' ? 'danger' : 'warning'}`}>{o.status}</span>{o.trackingNumber && <div className="muted">{o.trackingNumber}</div>}</td>
            <td><div className="inline orderActions">
              <Link className="iconBtn" href={`/admin/orders/${o.id}`} title="Open order">→</Link>
              <Link className="iconBtn" href={`/admin/orders/${o.id}/invoice`} title="Invoice"><FileText size={15}/></Link>
              <button className="iconBtn" onClick={() => openTracking(o)} disabled={busy === o.id} title="Tracking"><Truck size={15}/></button>
              {canCancel && <button className="iconBtn dangerIcon" onClick={() => setModal({ type: 'cancel', order: o })} disabled={busy === o.id} title="Cancel"><X size={15}/></button>}
              {o.paymentStatus !== 'REFUNDED' && o.status !== 'CANCELLED' && <button className="iconBtn" onClick={() => { setRefundAmount(''); setModal({ type: 'refund', order: o }) }} disabled={busy === o.id} title="Refund"><RefreshCw size={15}/></button>}
            </div></td>
          </tr>
        })}</tbody></table></div>
      {!shown.length && <div className="empty"><PackageCheck size={28}/><h3>No orders found</h3><p className="muted">Try another view or search term.</p></div>}
    </div>

    {modal && <div className="modalOverlay" onClick={() => setModal(null)}><div className="card orderModal" onClick={e => e.stopPropagation()}>
      <div className="inventoryModalHead"><div><span className="muted tiny">ORDER #{modal.order.orderNumber}</span><h2>{modal.type === 'cancel' ? 'Cancel order' : modal.type === 'refund' ? 'Refund order' : 'Add tracking'}</h2><p className="muted">{modal.type === 'cancel' ? 'This will release any remaining stock reservation.' : modal.type === 'refund' ? 'Refunds are recorded against the order and protected against over-refunding.' : 'Customers can use this tracking information to follow shipment progress.'}</p></div><button className="iconBtn" onClick={() => setModal(null)}><X size={17}/></button></div>
      {modal.type === 'cancel' && <><div className="confirmBox"><strong>#{modal.order.orderNumber}</strong><span>{money(modal.order.grandTotal, modal.order.currency)}</span><small>Current status: {modal.order.status}</small></div><div className="modalFooter"><button className="btn secondary" onClick={() => setModal(null)}>Keep order</button><button className="btn dangerBtn" onClick={cancelOrder} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Cancelling…' : 'Cancel order'}</button></div></>}
      {modal.type === 'refund' && <><label className="fieldLabel">Refund amount<input className="input" autoFocus type="number" min="0.01" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={money(modal.order.grandTotal, modal.order.currency)}/></label><p className="muted refundHint">Maximum refundable: <strong>{money(modal.order.grandTotal, modal.order.currency)}</strong></p><div className="modalFooter"><button className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn" onClick={refundOrder} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Processing…' : 'Issue refund'}</button></div></>}
      {modal.type === 'tracking' && <><label className="fieldLabel">Tracking number<input className="input" autoFocus value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Enter tracking number"/></label><label className="fieldLabel">Carrier<input className="input" value={trackingCompany} onChange={e => setTrackingCompany(e.target.value)} placeholder="Aramex, DHL, LibanPost…"/></label><div className="modalFooter"><button className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn" onClick={saveTracking} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Saving…' : 'Save tracking'}</button></div></>}
    </div></div>}
  </div>
}
