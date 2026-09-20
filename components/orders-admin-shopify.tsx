'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, PackageCheck, Plus, RefreshCw, Search, Truck, X } from 'lucide-react'
import { money } from '@/lib/config'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { canTransitionOrder } from '@/lib/orders'
import styles from './admin-orders-list.module.css'
import ui from './admin-ui.module.css'

type Order = any
type Modal = { type: 'cancel' | 'refund' | 'tracking'; order: Order } | null
type Initial = { rows: Order[]; total: number; page: number; pageSize: number; pages: number }

const statuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] as const

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

function tabCount(rows: Order[], tab: string) {
  if (tab === 'all') return rows.length
  if (tab === 'unfulfilled') return rows.filter(o => !['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)).length
  if (tab === 'unpaid') return rows.filter(o => ['UNPAID', 'PENDING'].includes(o.paymentStatus)).length
  if (tab === 'fulfilled') return rows.filter(o => ['SHIPPED', 'DELIVERED'].includes(o.status)).length
  if (tab === 'cancelled') return rows.filter(o => ['CANCELLED', 'REFUNDED'].includes(o.status)).length
  return 0
}
function matchesTab(o: Order, tab: string) {
  if (tab === 'all') return true
  if (tab === 'unfulfilled') return !['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status)
  if (tab === 'unpaid') return ['UNPAID', 'PENDING'].includes(o.paymentStatus)
  if (tab === 'fulfilled') return ['SHIPPED', 'DELIVERED'].includes(o.status)
  if (tab === 'cancelled') return ['CANCELLED', 'REFUNDED'].includes(o.status)
  return true
}
function statusPillClass(status: string) {
  if (['SHIPPED', 'DELIVERED'].includes(status)) return styles.pillSuccess
  if (status === 'CANCELLED') return styles.pillDanger
  if (status === 'REFUNDED') return styles.pillNeutral
  return styles.pillWarning
}
function paymentPillClass(status: string) {
  if (status === 'PAID') return styles.pillSuccess
  if (status === 'FAILED') return styles.pillDanger
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return styles.pillNeutral
  return styles.pillWarning
}

export function OrdersAdminShopify({ initial, canRefund = false, storeTimezone }: { initial: Initial; canRefund?: boolean; storeTimezone?: string }) {
  const [rows, setRows] = useState<Order[]>(initial?.rows || [])
  const [total, setTotal] = useState(Number(initial?.total ?? initial?.rows?.length ?? 0))
  const [page, setPage] = useState(Number(initial?.page || 1))
  const [pageSize, setPageSize] = useState(Number(initial?.pageSize || 50))
  const [pages, setPages] = useState(Number(initial?.pages || 1))
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCompany, setTrackingCompany] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const shown = rows.filter(o => matchesTab(o, tab))
  const stats = {
    total: rows.length,
    unfulfilled: tabCount(rows, 'unfulfilled'),
    unpaid: tabCount(rows, 'unpaid'),
    fulfilled: tabCount(rows, 'fulfilled'),
    revenue: rows.reduce((sum, o) => {
      if (['CANCELLED', 'REFUNDED'].includes(o.status)) return sum
      const refunded = Number(o.refundedTotal || o.refundedAmount || 0)
      return sum + Math.max(0, Number(o.grandTotal || 0) - refunded)
    }, 0),
  }
  const allShownSelected = shown.length > 0 && shown.every(o => selected.includes(o.id))

  async function load(nextPage = 1) {
    setLoading(true); setError(''); setNotice('')
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(pageSize) })
      if (q.trim()) params.set('q', q.trim())
      if (filter) params.set('status', filter)
      const data = await api(`/api/admin/orders?${params.toString()}`)
      setRows(Array.isArray(data) ? data : data.rows || [])
      setTotal(Number(data.pagination?.total ?? data.rows?.length ?? 0))
      setPages(Number(data.pagination?.pages ?? 1))
      setPage(Number(data.pagination?.page ?? nextPage))
      setSelected([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load orders')
    } finally {
      setLoading(false)
    }
  }

  async function update(id: string, data: any, message = 'Order updated.') {
    setBusy(id); setError(''); setNotice('')
    try {
      await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, ...data }) })
      await load(page)
      setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update order')
    } finally {
      setBusy(null)
    }
  }

  async function bulkStatus(status: string) {
    if (!selected.length) return
    const eligible = rows.filter(o => selected.includes(o.id) && canTransitionOrder(o.status, status as Parameters<typeof canTransitionOrder>[1])).map(o => o.id)
    if (!eligible.length) { setError(`No selected orders can move to ${status.toLowerCase()}.`); return }
    setBusy('bulk'); setError(''); setNotice('')
    try {
      for (const id of eligible) await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) })
      await load(page)
      setNotice(`${eligible.length} order${eligible.length === 1 ? '' : 's'} updated.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update selected orders')
    } finally {
      setBusy(null)
    }
  }

  async function cancelOrder() {
    if (!modal || modal.type !== 'cancel') return
    await update(modal.order.id, { status: 'CANCELLED' }, 'Order cancelled. Any remaining reservation was released.')
    setModal(null)
  }
  async function refundOrder() {
    if (!modal || modal.type !== 'refund') return
    const amount = Math.round(Number(refundAmount) * 100)
    const alreadyRefunded = Number(modal.order.refundedTotal || modal.order.refundedAmount || 0)
    const max = Math.max(0, Number(modal.order.grandTotal || 0) - alreadyRefunded)
    if (!Number.isInteger(amount) || amount <= 0 || amount > max) { setError(`Refund must be between 0.01 and ${money(max, modal.order.currency)}`); return }
    setBusy(modal.order.id); setError(''); setNotice('')
    try {
      await api('/api/admin/refunds', { method: 'POST', body: JSON.stringify({ orderId: modal.order.id, amount, reason: 'Admin refund' }) })
      await load(page)
      setModal(null); setRefundAmount(''); setNotice('Refund issued successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refund order')
    } finally {
      setBusy(null)
    }
  }
  async function saveTracking() {
    if (!modal || modal.type !== 'tracking') return
    await update(modal.order.id, { trackingNumber: trackingNumber.trim(), trackingCompany: trackingCompany.trim() || null }, 'Tracking information saved.')
    setModal(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Commerce</div>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>Manage orders, fulfillment, payments, tracking and refunds.</p>
        </div>
        <div className="inline">
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => load(page)} disabled={loading || busy !== null}><RefreshCw size={15} /> Refresh</button>
          <Link className={ui.btn} href="/admin/orders/new"><Plus size={15} /> Create order</Link>
        </div>
      </div>

      {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

      <div className={styles.statGrid}>
        <button className={`${styles.statCard}${tab === 'all' ? ` ${styles.statCardActive}` : ''}`} onClick={() => setTab('all')}><span>Loaded orders</span><strong>{stats.total}</strong></button>
        <button className={`${styles.statCard}${tab === 'unfulfilled' ? ` ${styles.statCardActive}` : ''}`} onClick={() => setTab('unfulfilled')}><span>Unfulfilled</span><strong>{stats.unfulfilled}</strong></button>
        <button className={`${styles.statCard}${tab === 'unpaid' ? ` ${styles.statCardActive}` : ''}`} onClick={() => setTab('unpaid')}><span>Unpaid</span><strong>{stats.unpaid}</strong></button>
        <button className={`${styles.statCard}${tab === 'fulfilled' ? ` ${styles.statCardActive}` : ''}`} onClick={() => setTab('fulfilled')}><span>Fulfilled</span><strong>{stats.fulfilled}</strong></button>
      </div>

      <div className={`${ui.card} ${styles.viewBar}`}>
        {['all', 'unfulfilled', 'unpaid', 'fulfilled', 'cancelled'].map(v => (
          <button key={v} className={`${styles.view}${tab === v ? ` ${styles.viewActive}` : ''}`} onClick={() => setTab(v)}>
            {v[0].toUpperCase() + v.slice(1)} <span>{tabCount(rows, v)}</span>
          </button>
        ))}
      </div>

      <div className={`${ui.card} ${styles.toolbar}`}>
        <div className={styles.search}>
          <Search size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(1) }} placeholder="Search orders, customers, email…" />
          {q && <button onClick={() => { setQ(''); void load(1) }} aria-label="Clear search"><X size={14} /></button>}
        </div>
        <select className={`${ui.select} ${styles.statusSelect}`} value={filter} onChange={e => { setFilter(e.target.value); void load(1) }}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => load(1)} disabled={loading}>{loading ? 'Searching…' : 'Apply'}</button>
        <span className={styles.revenue}><span>Revenue (loaded)</span>{money(stats.revenue)}</span>
      </div>

      {total > rows.length && (
        <div className={styles.truncNotice}>
          Showing {rows.length} of {total.toLocaleString()} matching orders on this page. Use the pager below, or narrow your search, to see the rest.
        </div>
      )}

      {selected.length > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkCount}><strong>{selected.length}</strong><span> selected</span></div>
          <div className={styles.bulkActions}>
            <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setSelected([])}>Clear</button>
            <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('PROCESSING')}>Mark processing</button>
            <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('SHIPPED')}>Mark shipped</button>
            <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} disabled={busy === 'bulk'} onClick={() => bulkStatus('CANCELLED')}>Cancel</button>
          </div>
        </div>
      )}

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={styles.tableTopline}>
          <span>{shown.length} order{shown.length === 1 ? '' : 's'} on this page</span>
          <label className="inline" style={{ gap: 8, fontSize: 12 }}>Rows
            <select className={`${ui.select} ${styles.compactSelect}`} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); void load(1) }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${styles.ordersTable}`}>
            <thead>
              <tr>
                <th><input aria-label="Select all" type="checkbox" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? selected.filter(id => !shown.some(o => o.id === id)) : [...new Set([...selected, ...shown.map(o => o.id)])])} /></th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(o => {
                const canCancel = canTransitionOrder(o.status, 'CANCELLED')
                const isSelected = selected.includes(o.id)
                return (
                  <tr key={o.id} className={isSelected ? styles.selectedRow : undefined}>
                    <td><input aria-label={`Select order ${o.orderNumber}`} type="checkbox" checked={isSelected} onChange={() => setSelected(current => current.includes(o.id) ? current.filter(id => id !== o.id) : [...current, o.id])} /></td>
                    <td>
                      <Link className={ui.textLink} href={`/admin/orders/${o.id}`}><span className={styles.orderNumber}>#{o.orderNumber}</span></Link>
                      <div className={styles.rowMeta}>{formatAdminDateTime(o.createdAt, storeTimezone)}</div>
                    </td>
                    <td><strong>{o.user?.name || 'Guest'}</strong><div className={styles.rowMeta}>{o.email}</div></td>
                    <td>{(o.items || []).reduce((a: number, x: any) => a + x.quantity, 0)}</td>
                    <td><strong>{money(o.grandTotal, o.currency)}</strong></td>
                    <td><span className={`${styles.statusPill} ${paymentPillClass(o.paymentStatus)}`}>{o.paymentStatus}</span><div className={styles.rowMeta}>{o.paymentMethod}</div></td>
                    <td><span className={`${styles.statusPill} ${statusPillClass(o.status)}`}>{o.status}</span>{o.trackingNumber && <div className={styles.rowMeta}>{o.trackingNumber}</div>}</td>
                    <td>
                      <div className={`inline ${styles.orderActions}`}>
                        <Link className={ui.iconBtn} href={`/admin/orders/${o.id}`} title="Open order"><ArrowUpRight size={15} /></Link>
                        <Link className={ui.iconBtn} href={`/admin/orders/${o.id}/invoice`} title="Invoice"><FileText size={15} /></Link>
                        <button className={ui.iconBtn} onClick={() => { setTrackingNumber(o.trackingNumber || ''); setTrackingCompany(o.trackingCompany || ''); setModal({ type: 'tracking', order: o }) }} disabled={busy === o.id} title="Tracking"><Truck size={15} /></button>
                        {canCancel && <button className={styles.dangerIcon} onClick={() => setModal({ type: 'cancel', order: o })} disabled={busy === o.id} title="Cancel"><X size={15} /></button>}
                        {canRefund && o.paymentStatus !== 'REFUNDED' && o.status !== 'CANCELLED' && <button className={ui.iconBtn} onClick={() => { setRefundAmount(''); setModal({ type: 'refund', order: o }) }} disabled={busy === o.id} title="Refund"><RefreshCw size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!shown.length && <div className={ui.empty}><PackageCheck size={28} /><h3>No orders found</h3><p className={ui.muted}>Try another view, filter or search term.</p></div>}
        <div className={styles.pagination}>
          <span className={ui.muted}>Page {page} of {pages} · {total.toLocaleString()} matching order{total === 1 ? '' : 's'}</span>
          <div className="inline">
            <button className={ui.iconBtn} disabled={page <= 1 || loading} onClick={() => load(page - 1)}><ChevronLeft size={16} /></button>
            <button className={ui.iconBtn} disabled={page >= pages || loading} onClick={() => load(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {modal && (
        <div className={ui.modalOverlay} onClick={() => setModal(null)}>
          <div className={`${ui.card} ${styles.orderModal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div>
                <span className={`${ui.muted} ${ui.tiny}`}>ORDER #{modal.order.orderNumber}</span>
                <h2>{modal.type === 'cancel' ? 'Cancel order' : modal.type === 'refund' ? 'Refund order' : 'Add tracking'}</h2>
                <p className={ui.muted}>{modal.type === 'cancel' ? 'This will release any remaining stock reservation.' : modal.type === 'refund' ? 'Refunds are recorded against the order and protected against over-refunding.' : 'Customers can use this tracking information to follow shipment progress.'}</p>
              </div>
              <button className={ui.iconBtn} onClick={() => setModal(null)}><X size={17} /></button>
            </div>

            {modal.type === 'cancel' && <>
              <div className={styles.confirmBox}>
                <strong>#{modal.order.orderNumber}</strong>
                <span>{money(modal.order.grandTotal, modal.order.currency)}</span>
                <small>Current status: {modal.order.status}</small>
              </div>
              <div className={styles.modalFooter}>
                <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal(null)}>Keep order</button>
                <button className={styles.dangerBtn} onClick={cancelOrder} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Cancelling…' : 'Cancel order'}</button>
              </div>
            </>}

            {modal.type === 'refund' && <>
              <label className={ui.fieldLabel}>Refund amount
                <input className={ui.input} autoFocus type="number" min="0.01" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={money(modal.order.grandTotal, modal.order.currency)} />
              </label>
              <p className={`${ui.muted} ${styles.refundHint}`}>Maximum refundable: <strong>{money(Math.max(0, Number(modal.order.grandTotal || 0) - Number(modal.order.refundedTotal || modal.order.refundedAmount || 0)), modal.order.currency)}</strong></p>
              <div className={styles.modalFooter}>
                <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal(null)}>Cancel</button>
                <button className={ui.btn} onClick={refundOrder} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Processing…' : 'Issue refund'}</button>
              </div>
            </>}

            {modal.type === 'tracking' && <>
              <label className={ui.fieldLabel}>Tracking number<input className={ui.input} autoFocus value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Enter tracking number" /></label>
              <label className={ui.fieldLabel}>Carrier<input className={ui.input} value={trackingCompany} onChange={e => setTrackingCompany(e.target.value)} placeholder="Aramex, DHL, LibanPost…" /></label>
              <div className={styles.modalFooter}>
                <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal(null)}>Cancel</button>
                <button className={ui.btn} onClick={saveTracking} disabled={busy === modal.order.id}>{busy === modal.order.id ? 'Saving…' : 'Save tracking'}</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
