'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { History, Search, X } from 'lucide-react'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import styles from './admin-activity.module.css'
import ui from './admin-ui.module.css'

type Row = {
  id: string
  createdAt: string
  actor: { name: string; email: string } | null
  action: string
  entity: string
  entityId: string | null
  metadataJson: string | null
}

async function api(path: string) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function actionTone(action: string) {
  const a = action.toLowerCase()
  if (a.includes('delet') || a.includes('deactivat') || a.includes('disabl') || a.includes('revok')) return styles.actionRemove
  if (a.includes('creat') || a.includes('restor') || a.includes('activat') || a.includes('enabl')) return styles.actionCreate
  if (a.includes('repair') || a.includes('refund') || a.includes('cancel')) return styles.actionCaution
  return styles.actionNeutral
}

function formatMetadata(raw: string | null) {
  if (!raw) return null
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

export default function ActivityLogAdmin({ initial, total, entities, pageSize, storeTimezone }: { initial: Row[]; total: number; entities: string[]; pageSize: number; storeTimezone?: string }) {
  const [rows, setRows] = useState(initial)
  const [count, setCount] = useState(total)
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  function fetchPage(reset: boolean) {
    const id = ++requestId.current
    if (reset) setLoading(true); else setLoadingMore(true)
    setError('')
    const skip = reset ? 0 : rows.length
    const params = new URLSearchParams({ skip: String(skip), take: String(pageSize) })
    if (q.trim()) params.set('q', q.trim())
    if (entity) params.set('entity', entity)
    api(`/api/admin/activity?${params.toString()}`)
      .then(data => {
        if (id !== requestId.current) return
        setRows(prev => reset ? data.rows : [...prev, ...data.rows])
        setCount(data.total)
      })
      .catch(e => { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load activity log') })
      .finally(() => { if (id === requestId.current) { setLoading(false); setLoadingMore(false) } })
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPage(true), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, entity])

  const canLoadMore = rows.length < count

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length])

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>SECURITY</span><h1 className={ui.title}>Activity log</h1><p className={ui.muted}>Every sensitive change made in the admin, who made it, and when.</p></div>
      <span className={ui.pill}>{count} event{count === 1 ? '' : 's'}</span>
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Search size={15} />
        <input placeholder="Search by actor, action, entity or reference…" value={q} onChange={e => setQ(e.target.value)} />
        {q && <button type="button" className={styles.clearBtn} onClick={() => setQ('')}><X size={14} /></button>}
      </div>
      <select className={`${ui.select} ${styles.select}`} value={entity} onChange={e => setEntity(e.target.value)}>
        <option value="">All entities</option>
        {entities.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      <span className={styles.count}>{loading ? 'Loading…' : `Showing ${rows.length} of ${count}`}</span>
    </div>

    <div className={`${ui.card} ${styles.tableCard}`}>
      <div className={ui.tableWrap}>
        <table className={`${ui.table} ${styles.table}`}>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reference</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const meta = formatMetadata(r.metadataJson)
              const isOpen = Boolean(expanded[r.id])
              return <tr key={r.id}>
                <td className={styles.timeCell}>{formatAdminDateTime(r.createdAt, storeTimezone)}</td>
                <td>{r.actor ? <><div className={styles.actorName}>{r.actor.name}</div><div className={styles.actorEmail}>{r.actor.email}</div></> : <span className={ui.muted}>System</span>}</td>
                <td><span className={`${styles.actionPill} ${actionTone(r.action)}`}>{r.action}</span></td>
                <td>{r.entity}</td>
                <td className={styles.entityId}>{r.entityId || '—'}</td>
                <td>
                  {meta ? <>
                    <button type="button" className={styles.metaToggle} onClick={() => setExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))}>{isOpen ? 'Hide' : 'View'}</button>
                    {isOpen && <pre className={styles.metaBlock}>{meta}</pre>}
                  </> : <span className={styles.metaToggle} aria-hidden>—</span>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      {empty && <div className={ui.empty}><History size={26} /><h3>No matching activity</h3><p className={ui.muted}>{q || entity ? 'Try a different search or clear the filters.' : 'Actions taken in the admin will appear here.'}</p></div>}
      {canLoadMore && !empty && <div className={styles.loadMoreBar}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={loadingMore} onClick={() => fetchPage(false)}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
    </div>
  </div>
}
