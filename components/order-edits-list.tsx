'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileEdit } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-order-edits.module.css'
import ui from './admin-ui.module.css'

type OrderEdit = {
  id: string
  orderId: string
  status: 'OPEN' | 'COMMITTED' | 'DISCARDED'
  subtotalBefore: number
  subtotalAfter: number
  deltaTotal: number
  reason: string | null
  createdAt: string
  committedAt: string | null
  items: any[]
  order: { id: string; orderNumber: string; currency: string; status: string } | null
}

function statusClass(status: string) {
  if (status === 'OPEN') return styles.statusOpen
  if (status === 'COMMITTED') return styles.statusCommitted
  return styles.statusDiscarded
}

export default function OrderEditsList({ initial, canManage }: { initial: OrderEdit[]; canManage: boolean }) {
  const [rows] = useState<OrderEdit[]>(initial || [])
  const [status, setStatus] = useState('ALL')

  const filtered = useMemo(() => rows.filter(r => status === 'ALL' || r.status === status), [rows, status])

  const views: Array<[string, string]> = [
    ['ALL', 'All'],
    ['OPEN', 'Open'],
    ['COMMITTED', 'Committed'],
    ['DISCARDED', 'Discarded'],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={ui.muted}>ORDERS</span>
          <h1 className={styles.title}>Order edits</h1>
          <p className={ui.muted}>Draft and applied changes to line items, quantities and pricing on existing orders.</p>
        </div>
      </div>

      <div className={`${ui.card} ${styles.views}`}>
        {views.map(([value, label]) => (
          <button key={value} className={`${styles.view}${status === value ? ` ${styles.viewActive}` : ''}`} onClick={() => setStatus(value)}>
            {label} <span className={ui.muted}>{value === 'ALL' ? rows.length : rows.filter(r => r.status === value).length}</span>
          </button>
        ))}
      </div>

      <div className={`${ui.card} ${styles.tableCard}`}>
        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${styles.resultsTable}`}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Items</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(edit => (
                <tr key={edit.id} onClick={() => { window.location.href = `/admin/order-edits/${edit.id}` }}>
                  <td>
                    <strong>{edit.order ? `#${edit.order.orderNumber}` : edit.orderId.slice(0, 8)}</strong>
                    {edit.order && <div className={ui.muted} style={{ fontSize: 11 }}>{edit.order.status}</div>}
                  </td>
                  <td><span className={`${styles.statusPill} ${statusClass(edit.status)}`}>{edit.status}</span></td>
                  <td>{edit.items?.length || 0}</td>
                  <td>
                    <span className={`${styles.delta} ${edit.deltaTotal > 0 ? styles.deltaPositive : edit.deltaTotal < 0 ? styles.deltaNegative : ''}`}>
                      {edit.deltaTotal > 0 ? '+' : ''}{money(edit.deltaTotal, edit.order?.currency)}
                    </span>
                  </td>
                  <td className={ui.muted}>{edit.reason || '—'}</td>
                  <td className={ui.muted}>{new Date(edit.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className={ui.empty}>
            <FileEdit size={20} />
            <p style={{ marginTop: 8 }}>No order edits {status === 'ALL' ? 'yet' : `with status ${status.toLowerCase()}`}.</p>
            {canManage && <p className={ui.muted}>Start one from an order's detail page.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
