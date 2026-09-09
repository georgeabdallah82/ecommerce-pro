'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Plus } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-purchase-orders.module.css'

type PO = {
  id: string
  number: string
  supplierName: string | null
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
  currency: string
  totalCost: number
  createdAt: string
  orderedAt: string | null
  receivedAt: string | null
  location: { id: string; name: string } | null
  items: { id: string; quantityOrdered: number; quantityReceived: number }[]
}

function statusClass(status: string) {
  return {
    DRAFT: styles.statusDraft, ORDERED: styles.statusOrdered, PARTIALLY_RECEIVED: styles.statusPartial,
    RECEIVED: styles.statusReceived, CANCELLED: styles.statusCancelled,
  }[status] || styles.statusDraft
}

function receivingProgress(items: PO['items']) {
  const ordered = items.reduce((s, i) => s + i.quantityOrdered, 0)
  const received = items.reduce((s, i) => s + i.quantityReceived, 0)
  return { ordered, received, pct: ordered ? Math.min(100, Math.round((received / ordered) * 100)) : 0 }
}

export default function PurchaseOrdersList({ initial, canManage }: { initial: PO[]; canManage: boolean }) {
  const [rows] = useState<PO[]>(initial || [])
  const [status, setStatus] = useState('ALL')

  const filtered = useMemo(() => rows.filter(r => status === 'ALL' || r.status === status), [rows, status])

  const views: Array<[string, string]> = [
    ['ALL', 'All'], ['DRAFT', 'Draft'], ['ORDERED', 'Ordered'], ['PARTIALLY_RECEIVED', 'Partially received'], ['RECEIVED', 'Received'], ['CANCELLED', 'Cancelled'],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className="muted">INVENTORY</span>
          <h1 className={styles.title}>Purchase orders</h1>
          <p className="muted">Order stock from suppliers and record what arrives at each location.</p>
        </div>
        {canManage && <Link className="btn" href="/admin/purchase-orders/new"><Plus size={16} /> New purchase order</Link>}
      </div>

      <div className={`card ${styles.views}`}>
        {views.map(([value, label]) => (
          <button key={value} className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`} onClick={() => setStatus(value)}>
            {label} <span className="muted">{value === 'ALL' ? rows.length : rows.filter(r => r.status === value).length}</span>
          </button>
        ))}
      </div>

      <div className={`card ${styles.tableCard}`}>
        <div className="tableWrap">
          <table className={`table ${styles.resultsTable}`}>
            <thead>
              <tr>
                <th>PO number</th><th>Supplier</th><th>Location</th><th>Status</th><th>Receiving</th><th>Total cost</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const progress = receivingProgress(po.items)
                return (
                  <tr key={po.id} onClick={() => { window.location.href = `/admin/purchase-orders/${po.id}` }}>
                    <td><strong>{po.number}</strong></td>
                    <td>{po.supplierName || <span className="muted">—</span>}</td>
                    <td>{po.location?.name || <span className="muted">Unassigned</span>}</td>
                    <td><span className={`${styles.statusPill} ${statusClass(po.status)}`}>{po.status.replace('_', ' ')}</span></td>
                    <td>
                      <div className={styles.progressWrap}>
                        <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${progress.pct}%` }} /></div>
                        <span className={styles.progressLabel}>{progress.received}/{progress.ordered}</span>
                      </div>
                    </td>
                    <td>{money(po.totalCost, po.currency)}</td>
                    <td className="muted">{new Date(po.createdAt).toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty">
            <Boxes size={20} />
            <p style={{ marginTop: 8 }}>No purchase orders {status === 'ALL' ? 'yet' : `with status ${status.toLowerCase().replace('_', ' ')}`}.</p>
            {canManage && <Link className="btn secondary" href="/admin/purchase-orders/new" style={{ marginTop: 10, display: 'inline-flex' }}>Create the first one</Link>}
          </div>
        )}
      </div>
    </div>
  )
}
