'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-order-edits.module.css'
import ui from './admin-ui.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

function statusClass(status: string) {
  if (status === 'OPEN') return styles.statusOpen
  if (status === 'COMMITTED') return styles.statusCommitted
  return styles.statusDiscarded
}

export default function OrderEditDetail({ initial, canManage }: { initial: any; canManage: boolean }) {
  const [edit, setEdit] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function apply() {
    if (!confirm('Apply this order edit? This will update the order\'s line items and totals.')) return
    setBusy(true); setMsg('')
    try {
      const d = await api(`/api/admin/order-edits/${edit.id}`, { method: 'POST' })
      setEdit((c: any) => ({ ...c, status: 'COMMITTED', committedAt: new Date().toISOString() }))
      setMsg(`Order edit applied. Order total is now ${money(d.order?.grandTotal ?? edit.order?.grandTotal, edit.order?.currency)}.`)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to apply order edit') } finally { setBusy(false) }
  }

  async function discard() {
    if (!confirm('Discard this order edit? This cannot be undone.')) return
    setBusy(true); setMsg('')
    try {
      await api(`/api/admin/order-edits/${edit.id}`, { method: 'DELETE' })
      setEdit((c: any) => ({ ...c, status: 'DISCARDED' }))
      setMsg('Order edit discarded.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to discard order edit') } finally { setBusy(false) }
  }

  const items = edit.items || []

  return (
    <div className={styles.page}>
      <div className={styles.detailHead}>
        <div>
          <Link className={ui.textLink} href="/admin/order-edits"><ArrowLeft size={15} /> Back to order edits</Link>
          <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>ORDER EDIT</span>
          <div className="inline" style={{ gap: 8 }}>
            <h1 className={ui.heading}>{edit.order ? `#${edit.order.orderNumber}` : edit.orderId.slice(0, 8)}</h1>
            <span className={`${styles.statusPill} ${statusClass(edit.status)}`}>{edit.status}</span>
          </div>
          <p className={ui.muted}>Created {new Date(edit.createdAt).toLocaleString()}</p>
        </div>
        <div className="inline">
          {edit.order && <Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/orders/${edit.order.id}`}>Open order</Link>}
          {canManage && edit.status === 'OPEN' && (
            <>
              <button className={`${ui.btn} ${ui.btnGhost}`} onClick={discard} disabled={busy}><X size={15} /> Discard</button>
              <button className={ui.btn} onClick={apply} disabled={busy}><Check size={15} /> {busy ? 'Applying…' : 'Apply edit'}</button>
            </>
          )}
        </div>
      </div>

      {msg && <div className={ui.alert}>{msg}</div>}

      <div className={styles.detailGrid}>
        <main className={styles.detailMain}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Line items</h3><span className={ui.muted}>{items.length} items</span></div>
            <div className={styles.itemRow + ' ' + styles.itemHead}>
              <span>Product</span><span>Qty</span><span>Unit price</span><span>Total</span><span>Original item</span>
            </div>
            {items.map((it: any) => (
              <div className={styles.itemRow} key={it.id}>
                <div>
                  <strong>{it.product?.name || it.productId}</strong>
                  {!it.orderItemId && <span className={styles.itemNew}>New</span>}
                  {it.product?.sku && <div className={ui.muted} style={{ fontSize: 11 }}>{it.product.sku}</div>}
                </div>
                <span>{it.quantity}</span>
                <span>{money(it.unitPrice, edit.order?.currency)}</span>
                <span>{money(it.totalPrice, edit.order?.currency)}</span>
                <span className={ui.muted} style={{ fontSize: 11 }}>{it.orderItemId ? it.orderItemId.slice(0, 8) : '—'}</span>
              </div>
            ))}
            {!items.length && <p className={ui.muted}>No line items on this edit.</p>}
          </section>

          {edit.reason && (
            <section className={ui.card} style={{ padding: 20 }}>
              <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Reason</h3></div>
              <p>{edit.reason}</p>
            </section>
          )}
        </main>

        <aside className={styles.detailRail}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Totals</h3></div>
            <div className={ui.summaryLine}><span>Subtotal before</span><strong>{money(edit.subtotalBefore, edit.order?.currency)}</strong></div>
            <div className={ui.summaryLine}><span>Subtotal after</span><strong>{money(edit.subtotalAfter, edit.order?.currency)}</strong></div>
            <div className={`${ui.summaryLine} ${ui.summaryLineTotal}`}><span>Change</span><strong>{edit.deltaTotal > 0 ? '+' : ''}{money(edit.deltaTotal, edit.order?.currency)}</strong></div>
          </section>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Details</h3></div>
            <div className={ui.summaryLine}><span>Status</span><strong>{edit.status}</strong></div>
            <div className={ui.summaryLine}><span>Created</span><strong>{new Date(edit.createdAt).toLocaleDateString()}</strong></div>
            {edit.committedAt && <div className={ui.summaryLine}><span>Applied</span><strong>{new Date(edit.committedAt).toLocaleString()}</strong></div>}
            {edit.order && <div className={ui.summaryLine}><span>Order status</span><strong>{edit.order.status}</strong></div>}
          </section>
        </aside>
      </div>
    </div>
  )
}
