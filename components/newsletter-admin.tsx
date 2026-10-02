'use client'

import { useMemo, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'
import s from './admin-marketing.module.css'

type Subscriber = { email: string; subscribedAt: string; source: string }

const SOURCE_LABELS: Record<string, string> = { homepage: 'Newsletter section', footer: 'Footer', storefront: 'Storefront' }

export default function NewsletterAdmin({ initial, canManage }: { initial: Subscriber[]; canManage: boolean }) {
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const visible = useMemo(() => rows.filter(row => row.email.includes(query.trim().toLowerCase())), [rows, query])
  const summary = useMemo(() => {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recent = rows.filter(row => row.subscribedAt && new Date(row.subscribedAt).getTime() >= monthAgo).length
    const bySource = new Map<string, number>()
    for (const row of rows) bySource.set(row.source, (bySource.get(row.source) || 0) + 1)
    const [topSource, topCount] = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0]
    return { recent, topSource: topSource ? SOURCE_LABELS[topSource] || topSource : '—', topCount }
  }, [rows])

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

  return <>
    <div className={s.stats}>
      <div className={`${ui.card} ${s.stat}`}><span>Subscribers</span><strong>{rows.length}</strong><small>On your email list</small></div>
      <div className={`${ui.card} ${s.stat}`}><span>Last 30 days</span><strong>{summary.recent}</strong><small>New sign-ups</small></div>
      <div className={`${ui.card} ${s.stat}`}><span>Top source</span><strong>{summary.topSource}</strong><small>{summary.topCount ? `${summary.topCount} sign-up${summary.topCount === 1 ? '' : 's'}` : 'No sign-ups yet'}</small></div>
    </div>
    <div className={ui.card} style={{ padding: 20 }}>
    <div className={s.toolbar}>
      <input className={ui.input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search emails" aria-label="Search emails" />
      <span className={ui.muted}>{rows.length} subscriber{rows.length === 1 ? '' : 's'}</span>
      <a className={`${ui.btn} ${ui.btnSecondary}`} href="/api/admin/newsletter?format=csv"><Download size={15} /> Export CSV</a>
    </div>
    {visible.length === 0 ? (
      <div className={ui.empty}>{rows.length ? 'No subscribers match your search.' : 'No subscribers yet. They appear here as soon as someone signs up.'}</div>
    ) : (
      <div className={ui.tableWrap}>
        <table className={`${ui.table} ${ui.cardTable}`}>
          <thead><tr><th>Email</th><th>Subscribed</th><th>From</th>{canManage && <th aria-label="Actions" />}</tr></thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.email}>
                <td data-cell="primary">{row.email}</td>
                <td data-label="Subscribed">{row.subscribedAt ? new Date(row.subscribedAt).toLocaleString() : '—'}</td>
                <td data-label="From">{SOURCE_LABELS[row.source] || row.source}</td>
                {canManage && <td data-cell="actions"><button type="button" className={ui.iconBtnDanger} onClick={() => remove(row.email)} disabled={busy === row.email} aria-label={`Remove ${row.email}`}><Trash2 size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    </div>
  </>
}
