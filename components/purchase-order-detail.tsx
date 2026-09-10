'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, PackageCheck, Send } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-purchase-orders.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

function statusClass(status: string) {
  return {
    DRAFT: styles.statusDraft, ORDERED: styles.statusOrdered, PARTIALLY_RECEIVED: styles.statusPartial,
    RECEIVED: styles.statusReceived, CANCELLED: styles.statusCancelled,
  }[status] || styles.statusDraft
}

export default function PurchaseOrderDetail({ initial, canManage }: { initial: any; canManage: boolean }) {
  const [po, setPo] = useState(initial)
  const [receiveNow, setReceiveNow] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const isTerminal = po.status === 'RECEIVED' || po.status === 'CANCELLED'
  const remaining = (item: any) => Math.max(0, item.quantityOrdered - item.quantityReceived)

  const totalReceiveNow = useMemo(() => Object.values(receiveNow).reduce((s: number, n: any) => s + (Number(n) || 0), 0), [receiveNow])

  async function refresh(updated: any) {
    setPo((c: any) => ({ ...c, ...updated, items: (updated.items || c.items).map((it: any) => ({ ...it, product: c.items.find((x: any) => x.id === it.id)?.product || null, variant: c.items.find((x: any) => x.id === it.id)?.variant || null })) }))
  }

  async function updateStatus(status: string) {
    if (status === 'CANCELLED' && !confirm('Cancel this purchase order?')) return
    setBusy(true); setMsg('')
    try {
      const d = await api(`/api/admin/purchase-orders/${po.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await refresh(d.purchaseOrder)
      setMsg(`Purchase order marked ${d.purchaseOrder.status.toLowerCase().replace('_', ' ')}.`)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to update purchase order') } finally { setBusy(false) }
  }

  async function saveReceiving() {
    const items = po.items
      .filter((it: any) => (receiveNow[it.id] || 0) > 0)
      .map((it: any) => ({ id: it.id, received: Math.min(it.quantityOrdered, it.quantityReceived + (Number(receiveNow[it.id]) || 0)) }))
    if (!items.length) return setMsg('Enter a quantity to receive for at least one item.')
    if (!po.location) return setMsg('This purchase order has no receiving location. Set one before receiving items.')
    setBusy(true); setMsg('')
    try {
      const d = await api(`/api/admin/purchase-orders/${po.id}`, { method: 'PATCH', body: JSON.stringify({ items }) })
      await refresh(d.purchaseOrder)
      setReceiveNow({})
      setMsg('Received quantities saved.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to save received quantities') } finally { setBusy(false) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.detailHead}>
        <div>
          <Link className="textLink" href="/admin/purchase-orders"><ArrowLeft size={15} /> Back to purchase orders</Link>
          <span className="muted tiny" style={{ display: 'block', marginTop: 12 }}>PURCHASE ORDER</span>
          <div className="inline" style={{ gap: 8 }}>
            <h1 className="h2">{po.number}</h1>
            <span className={`${styles.statusPill} ${statusClass(po.status)}`}>{po.status.replace('_', ' ')}</span>
          </div>
          <p className="muted">Created {new Date(po.createdAt).toLocaleString()}</p>
        </div>
        {canManage && !isTerminal && (
          <div className="inline">
            {po.status === 'DRAFT' && <button className="btn secondary" onClick={() => updateStatus('ORDERED')} disabled={busy}><Send size={15} /> Mark as ordered</button>}
            <button className="btn secondary" onClick={() => updateStatus('CANCELLED')} disabled={busy}><Ban size={15} /> Cancel</button>
            <button className="btn" onClick={() => updateStatus('RECEIVED')} disabled={busy || !po.location} title={!po.location ? 'A receiving location is required' : undefined}><PackageCheck size={15} /> Mark fully received</button>
          </div>
        )}
      </div>

      {msg && <div className="alert">{msg}</div>}
      {!po.location && !isTerminal && <div className="alert danger">This purchase order has no receiving location. Set one before it can be marked received.</div>}

      <div className={styles.detailGrid}>
        <main className={styles.detailMain}>
          <section className="card adminPanel" style={{ padding: 20 }}>
            <div className="sectionHead small"><h3>Items</h3><span className="muted">{po.items.length} items</span></div>
            <div className={styles.itemRow + ' ' + styles.itemHead}>
              <span>Product</span><span>Ordered</span><span>Received</span><span>Unit cost</span><span>Total</span><span>{!isTerminal ? 'Receive now' : ''}</span>
            </div>
            {po.items.map((it: any) => (
              <div className={styles.itemRow} key={it.id}>
                <div>
                  <strong>{it.product?.name || it.productId}</strong>
                  {it.variant?.name && <div className="muted" style={{ fontSize: 11 }}>{it.variant.name}</div>}
                  {(it.variant?.sku || it.product?.sku) && <div className="muted" style={{ fontSize: 11 }}>{it.variant?.sku || it.product?.sku}</div>}
                </div>
                <span>{it.quantityOrdered}</span>
                <span>{it.quantityReceived}</span>
                <span>{money(it.unitCost, po.currency)}</span>
                <span>{money(it.totalCost, po.currency)}</span>
                <span>
                  {!isTerminal && canManage ? (
                    remaining(it) > 0 ? (
                      <input
                        className={styles.receiveInput}
                        type="number" min="0" max={remaining(it)}
                        value={receiveNow[it.id] || ''}
                        placeholder="0"
                        onChange={e => setReceiveNow(prev => ({ ...prev, [it.id]: Math.max(0, Math.min(remaining(it), Number(e.target.value) || 0)) }))}
                      />
                    ) : <span className="muted">Complete</span>
                  ) : null}
                </span>
              </div>
            ))}
            {!isTerminal && canManage && (
              <div className="inline" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={saveReceiving} disabled={busy || totalReceiveNow <= 0 || !po.location} title={!po.location ? 'Set a receiving location first' : undefined}>{busy ? 'Saving…' : 'Save received quantities'}</button>
              </div>
            )}
          </section>

          {po.notes && (
            <section className="card adminPanel" style={{ padding: 20 }}>
              <div className="sectionHead small"><h3>Notes</h3></div>
              <p>{po.notes}</p>
            </section>
          )}
        </main>

        <aside className={styles.detailRail}>
          <section className="card adminPanel" style={{ padding: 20 }}>
            <div className="sectionHead small"><h3>Details</h3></div>
            <div className="summaryLine"><span>Supplier</span><strong>{po.supplierName || '—'}</strong></div>
            <div className="summaryLine"><span>Location</span><strong>{po.location?.name || 'Unassigned'}</strong></div>
            <div className="summaryLine"><span>Currency</span><strong>{po.currency}</strong></div>
            <div className="summaryLine total"><span>Total cost</span><strong>{money(po.totalCost, po.currency)}</strong></div>
          </section>
          <section className="card adminPanel" style={{ padding: 20 }}>
            <div className="sectionHead small"><h3>Timeline</h3></div>
            <div className="summaryLine"><span>Created</span><strong>{new Date(po.createdAt).toLocaleDateString()}</strong></div>
            {po.orderedAt && <div className="summaryLine"><span>Ordered</span><strong>{new Date(po.orderedAt).toLocaleDateString()}</strong></div>}
            {po.receivedAt && <div className="summaryLine"><span>Received</span><strong>{new Date(po.receivedAt).toLocaleDateString()}</strong></div>}
          </section>
        </aside>
      </div>
    </div>
  )
}
