'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Plus, RefreshCw, Search } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-draft-orders.module.css'
import ui from './admin-ui.module.css'

type DraftOrderItem = { id: string; quantity: number }
type DraftOrder = { id: string; orderNumber: string; email: string; status: string; grandTotal: number; currency: string; updatedAt: string; items: DraftOrderItem[] }

const STATUSES = ['DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED'] as const
const STATUS_TONE: Record<string, string> = { DRAFT: '', OPEN: ui.statusPillWarning, COMPLETED: ui.statusPillSuccess, CANCELLED: ui.statusPillDanger }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function DraftOrdersAdmin({ initial, canManage }: { initial: DraftOrder[]; canManage: boolean }) {
  const [rows, setRows] = useState<DraftOrder[]>(initial || [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const shown = useMemo(() => rows, [rows])

  async function refresh() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (status) params.set('status', status)
      setRows(await api(`/api/admin/draft-orders?${params.toString()}`))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load draft orders') }
    finally { setLoading(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>COMMERCE</span><h1 className={ui.heading}>Draft orders</h1><p className={ui.muted}>Orders started in the admin before they become real, stock-reserving orders.</p></div>
      <div className="inline">
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        {canManage && <Link className={ui.btn} href="/admin/draft-orders/new"><Plus size={15} /> New draft order</Link>}
      </div>
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className={`${ui.card} ${styles.toolbar}`}>
      <div className={styles.search}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && refresh()} placeholder="Search draft order number or email…" /></div>
      <select className={`${ui.select} ${styles.statusSelect}`} value={status} onChange={e => { setStatus(e.target.value); setTimeout(refresh, 0) }}>
        <option value="">All statuses</option>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>

    <div className={ui.card}>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Draft</th><th>Email</th><th>Items</th><th>Total</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            {shown.map(d => <tr key={d.id}>
              <td><Link className={ui.textLink} href={`/admin/draft-orders/${d.id}`}><strong>{d.orderNumber}</strong></Link></td>
              <td>{d.email}</td>
              <td>{(d.items || []).reduce((sum, i) => sum + i.quantity, 0)}</td>
              <td><strong>{money(d.grandTotal, d.currency)}</strong></td>
              <td><span className={`${ui.statusPill} ${STATUS_TONE[d.status] || ''}`}>{d.status}</span></td>
              <td className={ui.muted}>{new Date(d.updatedAt).toLocaleString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!shown.length && <div className={ui.empty}><ClipboardList size={28} /><h3>No draft orders found</h3><p className={ui.muted}>{canManage ? 'Start a new draft order to see it here.' : 'Draft orders created by staff will show up here.'}</p></div>}
    </div>
  </div>
}
