'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw, Wrench, XCircle } from 'lucide-react'

type Check = { key: string; label: string; severity: 'ok' | 'warning' | 'critical'; message: string; count?: number }
type Health = { status: 'ok' | 'warning' | 'critical'; checks: Check[]; generatedAt: string }

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

  return <div className="systemHealthPage">
    <div className="sectionHead"><div><span className="muted">OPERATIONS</span><h1 className="h2">System health</h1><p className="muted">A live control plane for backend configuration, data integrity and operational readiness.</p></div><div className="inline"><button className="btn secondary" onClick={refresh} disabled={busy}><RefreshCw size={15} /> {busy ? 'Checking…' : 'Refresh'}</button>{canRepair && <button className="btn" onClick={repair} disabled={busy}><Wrench size={15} /> Safe repair</button>}</div></div>
    {error && <div className="alert danger">{error}</div>}
    <div className="healthHero card"><div><span className={`statusPill ${health.status === 'ok' ? 'success' : health.status === 'warning' ? 'warning' : 'danger'}`}><StatusIcon severity={health.status === 'ok' ? 'ok' : health.status} /> {health.status === 'ok' ? 'All systems healthy' : health.status === 'warning' ? 'Attention required' : 'Critical issues detected'}</span><div className="healthTimestamp">Last checked {new Date(health.generatedAt).toLocaleString()}</div></div><div className="healthTotals"><div><strong>{counts.ok}</strong><span>Healthy</span></div><div><strong>{counts.warning}</strong><span>Warnings</span></div><div><strong>{counts.critical}</strong><span>Critical</span></div></div></div>
    <div className="healthGrid">{health.checks.map(check => <div className={`healthCheck card ${check.severity}`} key={check.key}><div className="healthCheckHead"><span className={`statusPill ${check.severity === 'ok' ? 'success' : check.severity === 'warning' ? 'warning' : 'danger'}`}><StatusIcon severity={check.severity} /> {check.severity}</span>{typeof check.count === 'number' && <strong>{check.count}</strong>}</div><h3>{check.label}</h3><p>{check.message}</p></div>)}</div>
  </div>
}
