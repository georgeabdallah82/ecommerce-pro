'use client'

import { useMemo, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'

type Subscriber = { email: string; subscribedAt: string; source: string }

const SOURCE_LABELS: Record<string, string> = { homepage: 'Newsletter section', footer: 'Footer', storefront: 'Storefront' }

export default function NewsletterAdmin({ initial, canManage }: { initial: Subscriber[]; canManage: boolean }) {
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const visible = useMemo(() => rows.filter(row => row.email.includes(query.trim().toLowerCase())), [rows, query])

  async function remove(email: string) {
    if (!window.confirm(`Remove ${email} from the list?`)) return
    setBusy(email)
    try {
      const res = await fetch(`/api/admin/newsletter?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to remove subscriber')
      setRows(current => current.filter(row => row.email !== email))
      toast('Subscriber removed.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Unable to remove subscriber', 'error')
    } finally { setBusy(null) }
  }

  return <div className={ui.card} style={{ padding: 20 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <input className={ui.input} style={{ maxWidth: 320 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search emails" aria-label="Search emails" />
      <span className={ui.muted}>{rows.length} subscriber{rows.length === 1 ? '' : 's'}</span>
      <a className={`${ui.btn} ${ui.btnSecondary}`} style={{ marginLeft: 'auto' }} href="/api/admin/newsletter?format=csv"><Download size={15} /> Export CSV</a>
    </div>
    {visible.length === 0 ? (
      <div className={ui.empty}>{rows.length ? 'No subscribers match your search.' : 'No subscribers yet. They appear here as soon as someone signs up.'}</div>
    ) : (
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Email</th><th>Subscribed</th><th>From</th>{canManage && <th aria-label="Actions" />}</tr></thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.email}>
                <td>{row.email}</td>
                <td>{row.subscribedAt ? new Date(row.subscribedAt).toLocaleString() : '—'}</td>
                <td>{SOURCE_LABELS[row.source] || row.source}</td>
                {canManage && <td><button type="button" className={ui.iconBtnDanger} onClick={() => remove(row.email)} disabled={busy === row.email} aria-label={`Remove ${row.email}`}><Trash2 size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
}
