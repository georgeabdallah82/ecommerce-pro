'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, History, Search, X } from 'lucide-react'
import { addCalendarDays, formatAdminDateTime, zonedDayKey } from '@/lib/admin-datetime'
import styles from './admin-activity.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

type Actor = { id: string; name: string; email: string }
type Row = {
  id: string
  createdAt: string
  actor: Actor | null
  action: string
  entity: string
  entityId: string | null
  metadataJson: string | null
}

type Preset = 'all' | 'today' | '7d' | '30d' | 'custom'
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]

async function api(path: string) {
  const res = await fetchRead(path, { headers: { 'content-type': 'application/json' } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function actionTone(action: string) {
  const a = action.toLowerCase()
  if (a.includes('delet') || a.includes('deactivat') || a.includes('disabl') || a.includes('revok') || a.includes('remov')) return styles.actionRemove
  if (a.includes('creat') || a.includes('restor') || a.includes('activat') || a.includes('enabl') || a.includes('approv')) return styles.actionCreate
  if (a.includes('repair') || a.includes('refund') || a.includes('cancel') || a.includes('problem') || a.includes('reject')) return styles.actionCaution
  return styles.actionNeutral
}

// "order.driver_problem" -> "Order · driver problem"; "cashCollected" -> "Cash collected".
function readableAction(action: string) {
  const [area, ...rest] = action.split('.')
  if (!rest.length) return action.replace(/[_-]+/g, ' ')
  return `${area[0].toUpperCase()}${area.slice(1)} · ${rest.join(' ').replace(/[_-]+/g, ' ')}`
}

function readableKey(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function readableValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// The change details as label/value pairs; anything that isn't a plain object is shown as text.
function detailPairs(raw: string | null): { pairs: [string, string][]; text: string | null } {
  if (!raw) return { pairs: [], text: null }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { pairs: Object.entries(parsed).map(([k, v]) => [readableKey(k), readableValue(v)]), text: null }
    }
    return { pairs: [], text: JSON.stringify(parsed, null, 2) }
  } catch {
    return { pairs: [], text: raw }
  }
}

// Where an entity's record lives in the admin, when there is one.
function entityHref(entity: string, entityId: string | null) {
  if (!entityId) return null
  if (entity === 'Order') return `/admin/orders/${entityId}`
  return null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={styles.copyBtn}
      aria-label={copied ? 'Copied' : 'Copy reference'}
      title={copied ? 'Copied' : 'Copy reference'}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

export default function ActivityLogAdmin({ initial, total, entities, actions, actors, pageSize, storeTimezone }: {
  initial: Row[]
  total: number
  entities: string[]
  actions: string[]
  actors: Actor[]
  pageSize: number
  storeTimezone?: string
}) {
  const tz = storeTimezone || undefined
  const today = useMemo(() => zonedDayKey(new Date(), tz), [tz])
  const yesterday = useMemo(() => addCalendarDays(today, -1), [today])

  const [rows, setRows] = useState(initial)
  const [count, setCount] = useState(total)
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [preset, setPreset] = useState<Preset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const firstLoad = useRef(true)

  // The date range the filters ask for, as calendar days in the store's timezone.
  const range = useMemo(() => {
    if (preset === 'today') return { from: today, to: today }
    if (preset === '7d') return { from: addCalendarDays(today, -6), to: today }
    if (preset === '30d') return { from: addCalendarDays(today, -29), to: today }
    if (preset === 'custom') return { from: customFrom, to: customTo }
    return { from: '', to: '' }
  }, [preset, today, customFrom, customTo])

  const activeFilters = [q.trim(), entity, action, actor, range.from || range.to].filter(Boolean).length

  function buildParams(skip: number) {
    const params = new URLSearchParams({ skip: String(skip), take: String(pageSize) })
    if (q.trim()) params.set('q', q.trim())
    if (entity) params.set('entity', entity)
    if (action) params.set('action', action)
    if (actor) params.set('actor', actor)
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    return params
  }

  function fetchPage(reset: boolean) {
    const id = ++requestId.current
    if (reset) setLoading(true); else setLoadingMore(true)
    setError('')
    const skip = reset ? 0 : rows.length
    api(`/api/admin/activity?${buildParams(skip).toString()}`)
      .then(data => {
        if (id !== requestId.current) return
        setRows(prev => reset ? data.rows : [...prev, ...data.rows])
        setCount(data.total)
        if (reset) setExpanded({})
      })
      .catch(e => { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load activity log') })
      .finally(() => { if (id === requestId.current) { setLoading(false); setLoadingMore(false) } })
  }

  // Any filter change reloads from the start (after a short pause while typing). The first render
  // already has the unfiltered list from the server.
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPage(true), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, entity, action, actor, range.from, range.to])

  function clearFilters() {
    setQ(''); setEntity(''); setAction(''); setActor(''); setPreset('all'); setCustomFrom(''); setCustomTo('')
  }

  const canLoadMore = rows.length < count
  const empty = !loading && rows.length === 0

  // Rows grouped by the store's calendar day, newest day first.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Row[] }[] = []
    for (const r of rows) {
      const key = zonedDayKey(r.createdAt, tz) || r.createdAt.slice(0, 10)
      const last = out[out.length - 1]
      if (last && last.key === key) { last.items.push(r); continue }
      const label = key === today ? 'Today' : key === yesterday ? 'Yesterday'
        : formatAdminDateTime(r.createdAt, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      out.push({ key, label, items: [r] })
    }
    return out
  }, [rows, tz, today, yesterday])

  const todayCount = rows.filter(r => zonedDayKey(r.createdAt, tz) === today).length

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>SECURITY</span>
        <h1 className={ui.title}>Activity log</h1>
        <p className={ui.muted}>Every sensitive change made in the admin, who made it, and when. Times are in your store&apos;s timezone. Entries older than a year are removed each day.</p>
      </div>
      <div className={styles.headStats}>
        <span className={ui.pill}>{count} event{count === 1 ? '' : 's'}</span>
        {!!todayCount && <span className={ui.pill}>{todayCount} today</span>}
        <a className={`${ui.btn} ${ui.btnSecondary}`} href={`/api/admin/activity/export?${buildParams(0).toString()}`}>Export CSV</a>
      </div>
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Search size={15} />
        <input placeholder="Search by staff, action, record or reference…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search activity" />
        {q && <button type="button" className={styles.clearBtn} onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>}
      </div>
      <div className={styles.filters}>
        <label className={styles.filter}>
          <span>Staff</span>
          <select className={ui.select} value={actor} onChange={e => setActor(e.target.value)}>
            <option value="">Everyone</option>
            <option value="system">System (automatic)</option>
            {actors.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
          </select>
        </label>
        <label className={styles.filter}>
          <span>Record type</span>
          <select className={ui.select} value={entity} onChange={e => setEntity(e.target.value)}>
            <option value="">All records</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className={styles.filter}>
          <span>Action</span>
          <select className={ui.select} value={action} onChange={e => setAction(e.target.value)}>
            <option value="">All actions</option>
            {actions.map(a => <option key={a} value={a}>{readableAction(a)}</option>)}
          </select>
        </label>
        <label className={styles.filter}>
          <span>Date</span>
          <select className={ui.select} value={preset} onChange={e => setPreset(e.target.value as Preset)}>
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        {preset === 'custom' && <>
          <label className={styles.filter}>
            <span>From</span>
            <input type="date" className={ui.input} value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} />
          </label>
          <label className={styles.filter}>
            <span>To</span>
            <input type="date" className={ui.input} value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} />
          </label>
        </>}
      </div>
      <div className={styles.toolbarFoot}>
        <span className={styles.count}>{loading ? 'Loading…' : `Showing ${rows.length} of ${count}`}</span>
        {activeFilters > 0 && <button type="button" className={styles.clearAll} onClick={clearFilters}>Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}</button>}
      </div>
    </div>

    <div className={`${ui.card} ${styles.tableCard}`}>
      <div className={ui.tableWrap}>
        <table className={`${ui.table} ${styles.table}`}>
          <thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Record</th><th>Reference</th><th><span className={styles.srOnly}>Details</span></th></tr></thead>
          <tbody>
            {groups.map(group => <GroupRows key={group.key} group={group} tz={tz} expanded={expanded} setExpanded={setExpanded} />)}
          </tbody>
        </table>
      </div>
      {empty && <div className={ui.empty}>
        <History size={26} />
        <h3>No matching activity</h3>
        <p className={ui.muted}>{activeFilters ? 'Try different filters, or clear them to see everything.' : 'Actions taken in the admin will appear here.'}</p>
        {activeFilters > 0 && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={clearFilters}>Clear filters</button>}
      </div>}
      {canLoadMore && !empty && <div className={styles.loadMoreBar}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={loadingMore || loading} onClick={() => fetchPage(false)}>{loadingMore ? 'Loading…' : `Load more (${count - rows.length} left)`}</button>
      </div>}
    </div>
  </div>
}

function GroupRows({ group, tz, expanded, setExpanded }: {
  group: { key: string; label: string; items: Row[] }
  tz?: string
  expanded: Record<string, boolean>
  setExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
}) {
  return <>
    <tr className={styles.groupRow}><th colSpan={6}>{group.label} <span>{group.items.length} event{group.items.length === 1 ? '' : 's'}</span></th></tr>
    {group.items.map(r => {
      const { pairs, text } = detailPairs(r.metadataJson)
      const hasDetails = pairs.length > 0 || !!text
      const isOpen = Boolean(expanded[r.id])
      const href = entityHref(r.entity, r.entityId)
      return <RowBlock key={r.id} row={r} tz={tz} pairs={pairs} text={text} hasDetails={hasDetails} isOpen={isOpen} href={href} onToggle={() => setExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))} />
    })}
  </>
}

function RowBlock({ row: r, tz, pairs, text, hasDetails, isOpen, href, onToggle }: {
  row: Row
  tz?: string
  pairs: [string, string][]
  text: string | null
  hasDetails: boolean
  isOpen: boolean
  href: string | null
  onToggle: () => void
}) {
  return <>
    <tr className={isOpen ? styles.rowOpen : undefined}>
      <td className={styles.timeCell}>{formatAdminDateTime(r.createdAt, tz, { hour: 'numeric', minute: '2-digit' })}</td>
      <td>{r.actor
        ? <><div className={styles.actorName}>{r.actor.name || r.actor.email}</div>{r.actor.name && <div className={styles.actorEmail}>{r.actor.email}</div>}</>
        : <span className={styles.system}>System</span>}</td>
      <td><span className={`${styles.actionPill} ${actionTone(r.action)}`} title={r.action}>{readableAction(r.action)}</span></td>
      <td>{href ? <Link className={styles.recordLink} href={href}>{r.entity}</Link> : r.entity}</td>
      <td>
        {r.entityId
          ? <span className={styles.reference}><span className={styles.entityId} title={r.entityId}>{r.entityId.length > 14 ? `${r.entityId.slice(0, 12)}…` : r.entityId}</span><CopyButton value={r.entityId} /></span>
          : <span className={ui.muted}>—</span>}
      </td>
      <td className={styles.detailCell}>
        {hasDetails
          ? <button type="button" className={styles.metaToggle} aria-expanded={isOpen} onClick={onToggle}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {isOpen ? 'Hide' : 'Details'}
            </button>
          : <span className={ui.muted}>—</span>}
      </td>
    </tr>
    {isOpen && hasDetails && <tr className={styles.detailRow}>
      <td colSpan={6}>
        {pairs.length > 0
          ? <dl className={styles.detailGrid}>{pairs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          : <pre className={styles.metaBlock}>{text}</pre>}
      </td>
    </tr>}
  </>
}
