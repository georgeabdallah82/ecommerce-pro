'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertCircle, CheckCircle2, ChevronRight, Copy, RefreshCw, Search, Wrench, X, XCircle } from 'lucide-react'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { useConfirm } from './admin-confirm'
import styles from './admin-system-health.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

type Severity = 'ok' | 'warning' | 'critical'
type Check = { key: string; label: string; severity: Severity; message: string; count?: number }
type Health = { status: Severity; checks: Check[]; generatedAt: string }
type Filter = 'all' | 'attention' | 'critical' | 'healthy'

const TONE = { ok: ui.statusPillSuccess, warning: ui.statusPillWarning, critical: ui.statusPillDanger } as const
const CHECK_TONE = { ok: '', warning: styles.warning, critical: styles.critical } as const

// Where each check's underlying data is actually managed. A check with no
// entry here (database/auth/site-url) is infrastructure or an environment
// variable - there is nowhere in the admin UI to click through to fix it.
const CHECK_LINKS: Record<string, string> = {
  staff: '/admin/users',
  catalog: '/admin/products',
  'inventory-negative': '/admin/inventory',
  'inventory-reserved': '/admin/inventory',
  'low-stock': '/admin/inventory',
  locations: '/admin/operations',
  transfers: '/admin/inventory/transfers',
  orders: '/admin/orders',
  'draft-orders': '/admin/draft-orders',
  fulfillment: '/admin/orders',
  'purchase-orders': '/admin/purchase-orders',
  'gift-cards': '/admin/gift-cards',
  'order-edits': '/admin/order-edits',
  coupons: '/admin/coupons',
  shipping: '/admin/shipping',
  'product-publishing': '/admin/products',
  'sales-channels': '/admin/operations',
  webhooks: '/admin/operations',
  'api-credentials': '/admin/operations',
  'abandoned-checkouts': '/admin/operations',
  'storefront-content': '/admin/online-store/pages',
  theme: '/admin/online-store/theme-editor',
  navigation: '/admin/online-store/navigation',
  'customer-base': '/admin/customers',
  payments: '/admin/settings',
  push: '/admin/settings',
  audit: '/admin/activity',
}

// The checks, grouped by the part of the business they protect. Anything not listed lands in "Other".
const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: 'store', title: 'Store setup', keys: ['site-url', 'email', 'payments', 'push', 'shipping', 'theme', 'navigation', 'storefront-content'] },
  { id: 'products', title: 'Products & stock', keys: ['catalog', 'product-publishing', 'inventory-negative', 'inventory-reserved', 'low-stock', 'locations', 'transfers'] },
  { id: 'sales', title: 'Orders & customers', keys: ['orders', 'fulfillment', 'draft-orders', 'order-edits', 'abandoned-checkouts', 'coupons', 'gift-cards', 'customer-base'] },
  { id: 'purchasing', title: 'Purchasing', keys: ['purchase-orders'] },
  { id: 'integrations', title: 'Integrations', keys: ['sales-channels', 'webhooks', 'api-credentials'] },
  { id: 'security', title: 'Security & access', keys: ['auth', 'staff', 'audit'] },
  { id: 'platform', title: 'Platform', keys: ['database'] },
]

async function api(path: string, init?: RequestInit) {
  const res = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function StatusIcon({ severity }: { severity: Severity }) {
  if (severity === 'ok') return <CheckCircle2 size={16} />
  if (severity === 'critical') return <XCircle size={16} />
  return <AlertCircle size={16} />
}

const SEVERITY_LABEL: Record<Severity, string> = { ok: 'Healthy', warning: 'Warning', critical: 'Critical' }
const RANK: Record<Severity, number> = { critical: 0, warning: 1, ok: 2 }

export default function SystemHealthAdmin({ initial, canRepair, storeTimezone }: { initial: Health; canRepair: boolean; storeTimezone?: string }) {
  const confirm = useConfirm()
  const tz = storeTimezone || undefined
  const [health, setHealth] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  async function refresh() {
    setBusy(true); setError(''); setNotice('')
    try { setHealth(await api('/api/admin/system/health')) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refresh health') } finally { setBusy(false) }
  }

  async function repair() {
    if (!canRepair) return
    const ok = await confirm({
      title: 'Run safe repair?',
      message: 'This publishes active products that have no publish date, and turns off coupons that have expired but are still active. Nothing else is changed.',
      confirmLabel: 'Run repair',
      tone: 'default',
    })
    if (!ok) return
    setBusy(true); setError(''); setNotice('')
    try {
      setHealth((await api('/api/admin/system/repair', { method: 'POST' })).health)
      setNotice('Safe repair finished. The results below are up to date.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to repair platform state') } finally { setBusy(false) }
  }

  const counts = useMemo(() => health.checks.reduce((a, c) => { a[c.severity] += 1; return a }, { ok: 0, warning: 0, critical: 0 } as Record<Severity, number>), [health.checks])
  const attention = counts.warning + counts.critical

  const summary = counts.critical
    ? `${counts.critical} critical ${counts.critical === 1 ? 'issue needs' : 'issues need'} attention now.`
    : attention
      ? `${attention} ${attention === 1 ? 'check needs' : 'checks need'} attention.`
      : `All ${health.checks.length} checks passed.`

  function copyReport() {
    const lines = [
      `Store health: ${SEVERITY_LABEL[health.status]}`,
      `Checked: ${formatAdminDateTime(health.generatedAt, tz)}`,
      `${counts.ok} healthy, ${counts.warning} warnings, ${counts.critical} critical`,
      '',
      ...[...health.checks].sort((a, b) => RANK[a.severity] - RANK[b.severity]).map(c => `[${SEVERITY_LABEL[c.severity]}] ${c.label}: ${c.message}`),
    ]
    navigator.clipboard?.writeText(lines.join('\n')).then(() => setNotice('Report copied to the clipboard.')).catch(() => setError('Could not copy the report.'))
  }

  // Filters and search narrow what's shown; the groups keep their order.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return health.checks.filter(c => {
      if (filter === 'attention' && c.severity === 'ok') return false
      if (filter === 'critical' && c.severity !== 'critical') return false
      if (filter === 'healthy' && c.severity !== 'ok') return false
      if (q && !`${c.label} ${c.message}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [health.checks, filter, query])

  const sections = useMemo(() => {
    const known = new Set(GROUPS.flatMap(g => g.keys))
    const other = health.checks.filter(c => !known.has(c.key))
    const all = [...GROUPS, ...(other.length ? [{ id: 'other', title: 'Other', keys: other.map(c => c.key) }] : [])]
    return all
      .map(g => ({
        id: g.id,
        title: g.title,
        items: visible.filter(c => g.keys.includes(c.key)).sort((a, b) => RANK[a.severity] - RANK[b.severity]),
        total: health.checks.filter(c => g.keys.includes(c.key)).length,
        issues: health.checks.filter(c => g.keys.includes(c.key) && c.severity !== 'ok').length,
      }))
      .filter(g => g.items.length > 0)
  }, [health.checks, visible])

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All checks', count: health.checks.length },
    { id: 'attention', label: 'Needs attention', count: attention },
    { id: 'critical', label: 'Critical', count: counts.critical },
    { id: 'healthy', label: 'Healthy', count: counts.ok },
  ]

  const renderCard = (check: Check) => {
    const href = CHECK_LINKS[check.key]
    const body = <>
      <div className={styles.checkHead}>
        <span className={`${ui.statusPill} ${TONE[check.severity]}`}><StatusIcon severity={check.severity} /> {SEVERITY_LABEL[check.severity]}</span>
        {typeof check.count === 'number' && <strong className={styles.checkCount}>{check.count}</strong>}
      </div>
      <h3>{check.label}</h3>
      <p>{check.message}</p>
      {href && <span className={styles.checkAction}>{check.severity === 'ok' ? 'Open' : 'Fix this'} <ChevronRight size={13} /></span>}
    </>
    const className = `${ui.card} ${styles.check} ${CHECK_TONE[check.severity]}`
    return href
      ? <Link href={href} className={className} key={check.key}>{body}</Link>
      : <div className={className} key={check.key}>{body}</div>
  }

  const renderHealthyRow = (check: Check) => {
    const href = CHECK_LINKS[check.key]
    const inner = <>
      <CheckCircle2 size={15} className={styles.okIcon} />
      <span className={styles.okLabel}>{check.label}</span>
      <span className={styles.okMessage}>{check.message}</span>
      {href && <ChevronRight size={14} className={styles.okChevron} />}
    </>
    return href
      ? <Link href={href} className={styles.okRow} key={check.key}>{inner}</Link>
      : <div className={styles.okRow} key={check.key}>{inner}</div>
  }

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>Health</span>
        <h1 className={ui.title}>System health</h1>
        <p className={ui.muted}>Checks your store&apos;s settings and data. Anything that needs attention is shown first.</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={copyReport} disabled={busy}><Copy size={15} /> Copy report</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy ? styles.spin : undefined} /> {busy ? 'Checking…' : 'Refresh'}</button>
        {canRepair && <button type="button" className={ui.btn} onClick={repair} disabled={busy} title="Publishes active products that have no publish date, and turns off expired coupons that are still active.">
          <Wrench size={15} /> Safe repair
        </button>}
      </div>
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {notice && <div className={ui.alert} role="status">{notice}</div>}

    <section className={`${ui.card} ${styles.hero}`} aria-live="polite">
      <div className={styles.heroMain}>
        <span className={`${ui.statusPill} ${TONE[health.status]}`}><StatusIcon severity={health.status} /> {health.status === 'ok' ? 'All systems healthy' : health.status === 'warning' ? 'Attention required' : 'Critical issues detected'}</span>
        <p className={styles.heroSummary}>{summary}</p>
        <div className={styles.timestamp}>Last checked {formatAdminDateTime(health.generatedAt, tz)}</div>
      </div>
      <div className={styles.filters} role="group" aria-label="Filter checks">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterTile} ${styles[`tile_${f.id}`]} ${filter === f.id ? styles.filterOn : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            <strong>{f.count}</strong>
            <span>{f.label}</span>
          </button>
        ))}
      </div>
    </section>

    <div className={styles.searchRow}>
      <div className={styles.search}>
        <Search size={15} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search checks…" aria-label="Search checks" />
        {query && <button type="button" className={styles.clearBtn} onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
      </div>
      <span className={ui.muted}>{visible.length} of {health.checks.length} checks</span>
    </div>

    {sections.length === 0 && <div className={`${ui.card} ${ui.empty}`}>
      <CheckCircle2 size={26} />
      <h3>No checks match</h3>
      <p className={ui.muted}>{query ? 'Try a different search.' : 'There are no checks in this view.'}</p>
      <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setQuery(''); setFilter('all') }}>Show all checks</button>
    </div>}

    {sections.map(section => {
      const problems = section.items.filter(c => c.severity !== 'ok')
      const healthy = section.items.filter(c => c.severity === 'ok')
      return <section key={section.id} className={styles.section} aria-labelledby={`health-${section.id}`}>
        <div className={styles.sectionHead}>
          <h2 id={`health-${section.id}`}>{section.title}</h2>
          <span className={section.issues ? styles.sectionIssues : styles.sectionOk}>
            {section.issues ? `${section.issues} need${section.issues === 1 ? 's' : ''} attention` : section.total === 1 ? 'Healthy' : `All ${section.total} healthy`}
          </span>
        </div>
        {problems.length > 0 && <div className={styles.grid}>{problems.map(renderCard)}</div>}
        {healthy.length > 0 && <div className={styles.okList}>{healthy.map(renderHealthyRow)}</div>}
      </section>
    })}
  </div>
}
