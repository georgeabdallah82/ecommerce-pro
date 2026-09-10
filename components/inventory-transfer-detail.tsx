'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Ban, PackageCheck, Send } from 'lucide-react'
import styles from './admin-transfers.module.css'
import ui from './admin-ui.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

function statusClass(status: string) {
  return {
    DRAFT: styles.statusDraft, PENDING: styles.statusPending, IN_TRANSIT: styles.statusInTransit,
    RECEIVED: styles.statusReceived, CANCELLED: styles.statusCancelled,
  }[status] || styles.statusDraft
}

export default function InventoryTransferDetail({ initial, canManage }: { initial: any; canManage: boolean }) {
  const [transfer, setTransfer] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const isTerminal = transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED'

  async function updateStatus(status: string) {
    if (status === 'CANCELLED' && !confirm('Cancel this transfer?')) return
    if (status === 'IN_TRANSIT' && !confirm('Ship this transfer? Stock will be deducted from the source location now.')) return
    if (status === 'RECEIVED' && !confirm('Receive this transfer? Stock will be added to the destination location now.')) return
    setBusy(true); setMsg('')
    try {
      const d = await api(`/api/admin/inventory/transfers/${transfer.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setTransfer((c: any) => ({ ...c, ...d.transfer, items: (d.transfer.items || c.items).map((it: any) => ({ ...it, product: c.items.find((x: any) => x.id === it.id)?.product || null, variant: c.items.find((x: any) => x.id === it.id)?.variant || null })) }))
      setMsg(`Transfer marked ${d.transfer.status.toLowerCase().replace('_', ' ')}.`)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to update transfer') } finally { setBusy(false) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.detailHead}>
        <div>
          <Link className={ui.textLink} href="/admin/inventory/transfers"><ArrowLeft size={15} /> Back to transfers</Link>
          <span className={`${ui.muted} ${ui.tiny}`} style={{ display: 'block', marginTop: 12 }}>INVENTORY TRANSFER</span>
          <div className="inline" style={{ gap: 8 }}>
            <h1 className={ui.heading}>{transfer.reference}</h1>
            <span className={`${styles.statusPill} ${statusClass(transfer.status)}`}>{transfer.status.replace('_', ' ')}</span>
          </div>
          <p className={ui.muted}>Created {new Date(transfer.createdAt).toLocaleString()}</p>
        </div>
        {canManage && !isTerminal && (
          <div className="inline">
            {transfer.status === 'DRAFT' && <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => updateStatus('PENDING')} disabled={busy}>Mark as pending</button>}
            {transfer.status === 'PENDING' && <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => updateStatus('DRAFT')} disabled={busy}>Revert to draft</button>}
            {transfer.status !== 'IN_TRANSIT' && <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => updateStatus('CANCELLED')} disabled={busy}><Ban size={15} /> Cancel</button>}
            {transfer.status === 'IN_TRANSIT'
              ? <button className={ui.btn} onClick={() => updateStatus('RECEIVED')} disabled={busy || !transfer.toLocation}><PackageCheck size={15} /> Receive transfer</button>
              : <button className={ui.btn} onClick={() => updateStatus('IN_TRANSIT')} disabled={busy || !transfer.fromLocation || !transfer.toLocation}><Send size={15} /> Ship transfer</button>}
          </div>
        )}
      </div>

      {msg && <div className={ui.alert}>{msg}</div>}
      {(!transfer.fromLocation || !transfer.toLocation) && !isTerminal && <div className={`${ui.alert} ${ui.alertDanger}`}>This transfer is missing a {!transfer.fromLocation ? 'source' : 'destination'} location, required before it can be shipped.</div>}

      <div className={styles.detailGrid}>
        <main className={styles.detailMain}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Items</h3><span className={ui.muted}>{transfer.items.length} items</span></div>
            <div className={styles.itemRow + ' ' + styles.itemHead}>
              <span>Product</span><span>Qty</span><span>Received</span>
            </div>
            {transfer.items.map((it: any) => (
              <div className={styles.itemRow} key={it.id}>
                <div>
                  <strong>{it.product?.name || it.productId}</strong>
                  {it.variant?.name && <div className={ui.muted} style={{ fontSize: 11 }}>{it.variant.name}</div>}
                  {(it.variant?.sku || it.product?.sku) && <div className={ui.muted} style={{ fontSize: 11 }}>{it.variant?.sku || it.product?.sku}</div>}
                </div>
                <span>{it.quantity}</span>
                <span>{it.received}</span>
              </div>
            ))}
          </section>

          {transfer.notes && (
            <section className={ui.card} style={{ padding: 20 }}>
              <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Notes</h3></div>
              <p>{transfer.notes}</p>
            </section>
          )}
        </main>

        <aside className={styles.detailRail}>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Route</h3></div>
            <div className={styles.route} style={{ fontSize: 15, marginBottom: 6 }}>
              <strong>{transfer.fromLocation?.name || 'Unassigned'}</strong>
              <ArrowRight size={14} />
              <strong>{transfer.toLocation?.name || 'Unassigned'}</strong>
            </div>
          </section>
          <section className={ui.card} style={{ padding: 20 }}>
            <div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Timeline</h3></div>
            <div className={ui.summaryLine}><span>Created</span><strong>{new Date(transfer.createdAt).toLocaleDateString()}</strong></div>
            {transfer.shippedAt && <div className={ui.summaryLine}><span>Shipped</span><strong>{new Date(transfer.shippedAt).toLocaleDateString()}</strong></div>}
            {transfer.receivedAt && <div className={ui.summaryLine}><span>Received</span><strong>{new Date(transfer.receivedAt).toLocaleDateString()}</strong></div>}
          </section>
        </aside>
      </div>
    </div>
  )
}
