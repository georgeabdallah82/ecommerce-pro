'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, RotateCcw, Search, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-returns.module.css'
import ui from './admin-ui.module.css'

type ReturnItem = { id: string; orderItemId: string; productId: string; variantId: string | null; quantity: number }
type OrderSummary = { id: string; orderNumber: string; email: string; grandTotal: number; currency: string; status: string; items?: { id: string; name: string }[] } | null
type ReturnRequest = {
  id: string; orderId: string; status: string; reason: string; refundAmount: number; restock: boolean
  createdAt: string; receivedAt: string | null; refundedAt: string | null; items: ReturnItem[]; order: OrderSummary
}
type OrderItem = { id: string; name: string; sku: string; quantity: number; totalPrice: number }
type Order = { id: string; orderNumber: string; email: string; status: string; paymentStatus: string; grandTotal: number; currency: string; items: OrderItem[] }

const STATUS_TONE: Record<string, string> = {
  REQUESTED: ui.statusPillWarning, APPROVED: ui.statusPillWarning, RECEIVED: ui.statusPillWarning, REFUNDED: ui.statusPillSuccess, REJECTED: ui.statusPillDanger, CANCELLED: ui.statusPillDanger,
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function ReturnsAdmin({ initial, canManage }: { initial: ReturnRequest[]; canManage: boolean }) {
  const [rows, setRows] = useState<ReturnRequest[]>(initial || [])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [wizardOpen, setWizardOpen] = useState(false)
  const [orderQuery, setOrderQuery] = useState('')
  const [orderResults, setOrderResults] = useState<Order[]>([])
  const [searchingOrders, setSearchingOrders] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [refundAmount, setRefundAmount] = useState('')
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wizardError, setWizardError] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => `${r.order?.orderNumber || ''} ${r.order?.email || ''} ${r.status} ${r.reason}`.toLowerCase().includes(needle))
  }, [rows, q])

  async function refresh() {
    setLoading(true); setError('')
    try { setRows(await api('/api/admin/returns')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load returns') }
    finally { setLoading(false) }
  }

  function openWizard() {
    setWizardOpen(true); setOrderQuery(''); setOrderResults([]); setSelectedOrder(null)
    setQuantities({}); setRefundAmount(''); setRestock(true); setReason(''); setWizardError('')
  }
  function closeWizard() { setWizardOpen(false) }

  async function searchOrders() {
    if (!orderQuery.trim()) return
    setSearchingOrders(true); setWizardError('')
    try {
      const data = await api(`/api/admin/orders?q=${encodeURIComponent(orderQuery.trim())}&limit=10`)
      setOrderResults(Array.isArray(data.rows) ? data.rows : [])
    } catch (e) { setWizardError(e instanceof Error ? e.message : 'Unable to search orders') }
    finally { setSearchingOrders(false) }
  }

  function pickOrder(order: Order) {
    setSelectedOrder(order)
    setOrderResults([])
    setQuantities(Object.fromEntries((order.items || []).map(i => [i.id, 0])))
  }

  async function submitReturn() {
    if (!selectedOrder) return
    const items = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (!items.length) { setWizardError('Enter a return quantity for at least one item.'); return }
    const refundCents = refundAmount.trim() ? Math.round(Number(refundAmount) * 100) : 0
    if (!Number.isInteger(refundCents) || refundCents < 0) { setWizardError('Refund amount must be a valid, non-negative number.'); return }
    setSubmitting(true); setWizardError('')
    try {
      const data = await api('/api/admin/returns', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrder.id, items, refundAmount: refundCents, restock, reason: reason.trim() || 'Customer return' }),
      })
      const created: ReturnRequest = {
        ...data.returnRequest,
        order: { id: selectedOrder.id, orderNumber: selectedOrder.orderNumber, email: selectedOrder.email, grandTotal: selectedOrder.grandTotal, currency: selectedOrder.currency, status: selectedOrder.status, items: selectedOrder.items.map(i => ({ id: i.id, name: i.name })) },
      }
      setRows(current => [created, ...current])
      setNotice(`Return ${data.returnId || created.id} created for order #${selectedOrder.orderNumber}.`)
      setWizardOpen(false)
    } catch (e) { setWizardError(e instanceof Error ? e.message : 'Unable to create return') }
    finally { setSubmitting(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>COMMERCE</span><h1 className={ui.heading}>Returns</h1><p className={ui.muted}>Review return requests and initiate a return on a shipped or delivered order.</p></div>
      <div className="inline">
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        {canManage && <button className={ui.btn} onClick={openWizard}><Plus size={15} /> New return</button>}
      </div>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`}>{error || notice}</div>}

    <div className={`${ui.card} ${styles.toolbar}`}>
      <div className={styles.search}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by order number, email, status or reason…" /></div>
    </div>

    <div className={ui.card}>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Return</th><th>Order</th><th>Status</th><th>Items</th><th>Refund</th><th>Restock</th><th>Created</th></tr></thead>
          <tbody>
            {shown.map(r => <tr key={r.id}>
              <td><strong>{r.id.slice(0, 10)}…</strong></td>
              <td>{r.order ? <Link className={ui.textLink} href={`/admin/orders/${r.order.id}`}>#{r.order.orderNumber}</Link> : <span className={ui.muted}>Order removed</span>}<div className={ui.muted}>{r.order?.email}</div></td>
              <td><span className={`${ui.statusPill} ${STATUS_TONE[r.status] || ''}`}>{r.status}</span></td>
              <td><div className={styles.itemsCell}>{r.items.map(i => <span key={i.id}>{i.quantity} × {r.order?.items?.find(x => x.id === i.orderItemId)?.name || 'Item'}</span>)}{!r.items.length && <span>—</span>}</div></td>
              <td><strong>{money(r.refundAmount, r.order?.currency)}</strong></td>
              <td>{r.restock ? <span className={`${ui.statusPill} ${ui.statusPillSuccess}`}>Restocked</span> : <span className={ui.statusPill}>Not restocked</span>}</td>
              <td className={ui.muted}>{new Date(r.createdAt).toLocaleString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!shown.length && <div className={ui.empty}><RotateCcw size={28} /><h3>No return requests found</h3><p className={ui.muted}>{canManage ? 'Start a return from an order to see it here.' : 'Returns initiated by staff will show up here.'}</p></div>}
    </div>

    {wizardOpen && <div className={ui.modalOverlay} onClick={closeWizard}>
      <div className={`${ui.card} ${styles.modal}`} onClick={e => e.stopPropagation()}>
        <div className={ui.modalHead}>
          <div><span className={`${ui.muted} ${ui.tiny}`}>NEW RETURN</span><h2>Initiate a return</h2><p className={ui.muted}>Find a shipped or delivered order, choose what's coming back, and optionally issue a refund.</p></div>
          <button className={ui.iconBtn} onClick={closeWizard}><X size={17} /></button>
        </div>

        <div className={styles.modalBody}>
          {wizardError && <div className={`${ui.alert} ${ui.alertDanger}`}>{wizardError}</div>}

          {!selectedOrder && <>
            <div className={styles.search}>
              <Search size={15} />
              <input value={orderQuery} onChange={e => setOrderQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchOrders()} placeholder="Search order number, email or phone…" autoFocus />
              <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={searchOrders} disabled={searchingOrders || !orderQuery.trim()}>{searchingOrders ? 'Searching…' : 'Search'}</button>
            </div>
            <div className={styles.orderResults}>
              {orderResults.map(o => <button key={o.id} type="button" className={styles.orderResult} onClick={() => pickOrder(o)}>
                <div><strong>#{o.orderNumber}</strong><span>{o.email}</span></div>
                <span className={ui.statusPill}>{o.status}</span>
                <strong>{money(o.grandTotal, o.currency)}</strong>
              </button>)}
              {!orderResults.length && orderQuery.trim() && !searchingOrders && <p className={ui.muted}>No matching orders. Try another search.</p>}
            </div>
          </>}

          {selectedOrder && <>
            <div className={styles.selectedOrder}>
              <div><strong>#{selectedOrder.orderNumber}</strong><div className={ui.muted}>{selectedOrder.email} · {selectedOrder.status}</div></div>
              <button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setSelectedOrder(null)}>Change order</button>
            </div>

            {!['SHIPPED', 'DELIVERED'].includes(selectedOrder.status) && <div className={`${ui.alert} ${ui.alertDanger}`}>Only shipped or delivered orders can be returned.</div>}

            <div className={ui.tableWrap}>
              <table className={styles.returnItemsTable}>
                <thead><tr><th>Item</th><th>Purchased</th><th>Return qty</th></tr></thead>
                <tbody>{(selectedOrder.items || []).map(item => <tr key={item.id}>
                  <td><strong>{item.name}</strong><div className={ui.muted}>{item.sku}</div></td>
                  <td>{item.quantity}</td>
                  <td><input className={`${ui.input} ${ui.selectCompact} ${styles.qtyInput}`} type="number" min="0" max={item.quantity} value={quantities[item.id] ?? 0} onChange={e => setQuantities(current => ({ ...current, [item.id]: Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0)) }))} /></td>
                </tr>)}</tbody>
              </table>
            </div>

            <label className={ui.fieldLabel}>Refund amount<input className={ui.input} type="number" min="0" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder="0.00" /></label>
            <p className={ui.muted} style={{ fontSize: 11 }}>Order total: {money(selectedOrder.grandTotal, selectedOrder.currency)}. The refund can't exceed what's still refundable on this order (already-refunded amounts are excluded). Leave blank for no refund.</p>

            <label className={styles.restockRow}><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> Restock returned items into inventory</label>

            <label className={ui.fieldLabel}>Reason<textarea className={ui.textarea} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being returned?" /></label>

            <div className={styles.modalFooter}>
              <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={closeWizard} disabled={submitting}>Cancel</button>
              <button className={ui.btn} onClick={submitReturn} disabled={submitting}>{submitting ? 'Processing…' : 'Create return'}</button>
            </div>
          </>}
        </div>
      </div>
    </div>}
  </div>
}
