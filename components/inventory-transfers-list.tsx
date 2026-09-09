'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus, Truck } from 'lucide-react'
import styles from './admin-transfers.module.css'

type Transfer = {
  id: string
  reference: string
  status: 'DRAFT' | 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'
  createdAt: string
  fromLocation: { id: string; name: string } | null
  toLocation: { id: string; name: string } | null
  items: { id: string; quantity: number; received: number }[]
}

function statusClass(status: string) {
  return {
    DRAFT: styles.statusDraft, PENDING: styles.statusPending, IN_TRANSIT: styles.statusInTransit,
    RECEIVED: styles.statusReceived, CANCELLED: styles.statusCancelled,
  }[status] || styles.statusDraft
}

export default function InventoryTransfersList({ initial, canManage }: { initial: Transfer[]; canManage: boolean }) {
  const [rows] = useState<Transfer[]>(initial || [])
  const [status, setStatus] = useState('ALL')

  const filtered = useMemo(() => rows.filter(r => status === 'ALL' || r.status === status), [rows, status])

  const views: Array<[string, string]> = [
    ['ALL', 'All'], ['DRAFT', 'Draft'], ['PENDING', 'Pending'], ['IN_TRANSIT', 'In transit'], ['RECEIVED', 'Received'], ['CANCELLED', 'Cancelled'],
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className="muted">INVENTORY</span>
          <h1 className={styles.title}>Transfers</h1>
          <p className="muted">Move stock between locations and track what has shipped and arrived.</p>
        </div>
        {canManage && <Link className="btn" href="/admin/inventory/transfers/new"><Plus size={16} /> New transfer</Link>}
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
            <thead><tr><th>Reference</th><th>Route</th><th>Status</th><th>Items</th><th>Created</th></tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} onClick={() => { window.location.href = `/admin/inventory/transfers/${t.id}` }}>
                  <td><strong>{t.reference}</strong></td>
                  <td>
                    <div className={styles.route}>
                      <span>{t.fromLocation?.name || 'Unassigned'}</span>
                      <ArrowRight size={13} />
                      <span>{t.toLocation?.name || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td><span className={`${styles.statusPill} ${statusClass(t.status)}`}>{t.status.replace('_', ' ')}</span></td>
                  <td>{t.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty">
            <Truck size={20} />
            <p style={{ marginTop: 8 }}>No transfers {status === 'ALL' ? 'yet' : `with status ${status.toLowerCase().replace('_', ' ')}`}.</p>
            {canManage && <Link className="btn secondary" href="/admin/inventory/transfers/new" style={{ marginTop: 10, display: 'inline-flex' }}>Create the first one</Link>}
          </div>
        )}
      </div>
    </div>
  )
}
