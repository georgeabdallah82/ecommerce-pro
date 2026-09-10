'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, ChevronRight, RefreshCw, Wrench, XCircle } from 'lucide-react'
import styles from './admin-system-health.module.css'
import ui from './admin-ui.module.css'

type Check = { key: string; label: string; severity: 'ok' | 'warning' | 'critical'; message: string; count?: number }
type Health = { status: 'ok' | 'warning' | 'critical'; checks: Check[]; generatedAt: string }

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
  'storefront-content': '/admin/content',
  theme: '/admin/online-store/theme-editor',
  navigation: '/admin/online-store/navigation',
  'customer-base': '/admin/customers',
  payments: '/admin/settings',
  push: '/admin/settings',
  audit: '/admin/activity',
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function StatusIcon({ severity }: { severity: Check['severity'] }) {
  if (severity === 'ok') return <CheckCircle2 size={16} />
  if (severity === 'critical') return <XCircle size={16} />
  return <AlertCircle size={16} />
}

export default function SystemHealthAdmin({ initial, canRepair }: { initial: Health; canRepair: boolean }) {
  const [health, setHealth] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setBusy(true); setError('')
    try { setHealth(await api('/api/admin/system/health')) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refresh health') } finally { setBusy(false) }
  }

  async function repair() {
    if (!canRepair) return
    setBusy(true); setError('')
    try { setHealth((await api('/api/admin/system/repair', { method: 'POST' })).health) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to repair platform state') } finally { setBusy(false) }
  }

  const counts = health.checks.reduce((a, c) => { a[c.severity] += 1; return a }, { ok: 0, warning: 0, critical: 0 })

  return <div className={styles.page}>
    <div className={ui.sectionHead}><div><span className={ui.muted}>OPERATIONS</span><h1 className={ui.title}>System health</h1><p className={ui.muted}>A live control plane for backend configuration, data integrity and operational readiness.</p></div><div className="inline"><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh} disabled={busy}><RefreshCw size={15} /> {busy ? 'Checking…' : 'Refresh'}</button>{canRepair && <button className={ui.btn} onClick={repair} disabled={busy} title="Publishes active products missing a publish date, and disables expired coupons that are still marked active. Other warnings need to be fixed in their own admin section.">
        <Wrench size={15} /> Safe repair
      </button>}</div></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {canRepair && <p className={`${ui.muted} ${ui.tiny} ${styles.repairNote}`}>Safe repair only fixes two things automatically: unpublished active products and expired-but-active coupons. Every other card below links to the admin section where you can fix it.</p>}
    <div className={`${ui.card} ${styles.hero}`}><div><span className={`${ui.statusPill} ${TONE[health.status]}`}><StatusIcon severity={health.status} /> {health.status === 'ok' ? 'All systems healthy' : health.status === 'warning' ? 'Attention required' : 'Critical issues detected'}</span><div className={styles.timestamp}>Last checked {new Date(health.generatedAt).toLocaleString()}</div></div><div className={styles.totals}><div><strong>{counts.ok}</strong><span>Healthy</span></div><div><strong>{counts.warning}</strong><span>Warnings</span></div><div><strong>{counts.critical}</strong><span>Critical</span></div></div></div>
    <div className={styles.grid}>{health.checks.map(check => {
      const href = CHECK_LINKS[check.key]
      const body = <>
        <div className={styles.checkHead}><span className={`${ui.statusPill} ${TONE[check.severity]}`}><StatusIcon severity={check.severity} /> {check.severity}</span>{typeof check.count === 'number' && <strong>{check.count}</strong>}</div>
        <h3>{check.label}</h3>
        <p>{check.message}</p>
        {href && <span className={styles.checkAction}>{check.severity === 'ok' ? 'Open section' : 'Fix this'} <ChevronRight size={13} /></span>}
      </>
      const className = `${ui.card} ${styles.check} ${CHECK_TONE[check.severity]}`
      return href
        ? <Link href={href} className={className} key={check.key}>{body}</Link>
        : <div className={className} key={check.key}>{body}</div>
    })}</div>
  </div>
}
