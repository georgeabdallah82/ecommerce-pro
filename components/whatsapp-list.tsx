'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, Copy, Download, MessageCircle, Trash2 } from 'lucide-react'
import { formatAdminDate } from '@/lib/admin-datetime'
import { displayPhone } from '@/lib/checkout-followup'
import { useConfirm } from './admin-confirm'
import ui from './admin-ui.module.css'

type Row = { id: string; phone: string; name: string | null; source: string; createdAt: string }

// Admin > Customers > WhatsApp list (app/admin/customers/whatsapp).
export default function WhatsAppList({ initial, timezone, canManage }: { initial: Row[]; timezone: string; canManage: boolean }) {
  const [rows, setRows] = useState(initial)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const confirm = useConfirm()

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(rows.map(r => `+${r.phone}`).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  const csv = 'data:text/csv;charset=utf-8,' + encodeURIComponent(['phone,name,joined', ...rows.map(r => [`+${r.phone}`, (r.name || '').replace(/[",\n]/g, ' '), r.createdAt.slice(0, 10)].join(','))].join('\n'))
  async function remove(id: string, phone: string) {
    if (!(await confirm({ title: `Remove +${phone}?`, message: 'They stop getting your WhatsApp offers. Remove someone only when they ask to stop.', confirmLabel: 'Remove', tone: 'danger' }))) return
    setError('')
    const r = await fetch(`/api/admin/phone-subscribers?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Unable to remove'); return }
    setRows(current => current.filter(x => x.id !== id))
  }

  return <div style={{ display: 'grid', gap: 14, maxWidth: 860 }}>
    <Link className={ui.textLink} href="/admin/customers"><ArrowLeft size={15} /> Customers</Link>
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>PEOPLE</span><h1 className={ui.title}>WhatsApp list</h1><p className={ui.muted}>{rows.length} number{rows.length === 1 ? '' : 's'} from the welcome-discount popup. These people agreed to get your offers on WhatsApp. Remove anyone who asks to stop.</p></div>
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={copyAll} disabled={!rows.length}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy all numbers'}</button>
        <a className={`${ui.btn} ${ui.btnSecondary}`} href={csv} download="whatsapp-list.csv"><Download size={15} /> Download</a>
      </div>
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {!rows.length ? <div className={`${ui.card} ${ui.empty}`}><MessageCircle size={28} /><h3>No numbers yet</h3><p className={ui.muted}>Turn on the welcome discount in Settings &gt; Selling tools. Numbers people leave there show up here.</p></div>
      : <div className={`${ui.card}`}><div className={ui.tableWrap}><table className={ui.table}>
        <thead><tr><th>Number</th><th>Name</th><th>Joined</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <td><a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(r.phone)}</a></td>
          <td>{r.name || '—'}</td>
          <td>{formatAdminDate(r.createdAt, timezone)}</td>
          <td>{canManage && <button type="button" className={ui.iconBtn} onClick={() => remove(r.id, r.phone)} aria-label={`Remove ${displayPhone(r.phone)}`}><Trash2 size={15} /></button>}</td>
        </tr>)}</tbody>
      </table></div></div>}
  </div>
}
