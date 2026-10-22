'use client'

import { useCallback, useEffect, useState } from 'react'
import { LogOut, ShieldAlert, Smartphone, Trash2 } from 'lucide-react'
import styles from './admin-settings-center.module.css'
import ui from './admin-ui.module.css'
import { useConfirm } from './admin-confirm'

type Device = { id: string; label: string; country: string; first: string; last: string; current: boolean }
type EventRow = { id: string; at: string; text: string; warn: boolean }
type Data = { alertsOn: boolean; devices: Device[]; events: EventRow[] }

async function api(body?: unknown) {
  const r = await fetch('/api/admin/security', body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Settings > Security & access: the browsers this account signed in from, recent security
// events, and "sign out everywhere" (lib/sign-in-alerts.ts). The alert itself is switched on or
// off under Notifications.
export default function SignInAlertsCard() {
  const confirm = useConfirm()
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => api().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Could not load')), [])
  useEffect(() => { load() }, [load])

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true); setError(''); setMsg('')
    try { await api(body); setMsg(done); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusy(false) }
  }

  async function signOutEverywhere() {
    if (!await confirm({ title: 'Sign out everywhere?', message: 'Every other phone and computer signed in to your admin is signed out right now. This device stays signed in. Do this if a phone is lost, or an alert was not you.', confirmLabel: 'Sign out everywhere' })) return
    await run({ action: 'sign-out-everywhere' }, 'Done. Every other device is signed out. They need your password (and 2-step code) to get back in.')
  }

  async function forget(device: Device) {
    if (!await confirm({ title: `Forget ${device.label}?`, message: 'It is only removed from this list. The next sign-in from it raises the alert again. To sign it out, use "Sign out everywhere".', confirmLabel: 'Forget device' })) return
    await run({ action: 'forget-device', id: device.id }, 'Device forgotten.')
  }

  return <section className={`${ui.card} ${styles.card}`}>
    <header className={styles.cardHead}><div>
      <h2>Sign-in alerts</h2>
      <p className={ui.muted}>When someone signs in to your admin from a phone or computer it has not seen before, you get an email and a phone notification. You also hear about it if an account is locked after many wrong passwords or wrong 2-step codes. {data && !data.alertsOn ? 'The alerts are off now: turn them on under Notifications.' : 'You can turn them off under Notifications.'}</p>
    </div></header>
    <div className={styles.cardBody}>
      {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
      {msg && <div className={ui.alert} role="status">{msg}</div>}
      {!data ? <p className={ui.muted}>Loading…</p> : <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>Your devices</strong>
          {data.devices.length ? <div style={{ display: 'grid', gap: 8 }}>{data.devices.map(d => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--admin-border)', borderRadius: 10 }}>
            <Smartphone size={16} aria-hidden="true" />
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{d.label}{d.country ? ` · ${d.country}` : ''} {d.current && <span className={`${ui.statusPill} ${ui.statusPillSuccess}`}>This device</span>}</div>
              <div className={ui.muted} style={{ fontSize: 13 }}>Last used {when(d.last)} · first seen {when(d.first)}</div>
            </div>
            {!d.current && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} disabled={busy} onClick={() => forget(d)}><Trash2 size={13} /> Forget</button>}
          </div>)}</div> : <p className={ui.muted}>No devices yet. The next sign-in will show up here.</p>}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>Recent activity</strong>
          {data.events.length ? <div style={{ display: 'grid', gap: 6 }}>{data.events.map(e => <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 14 }}>
            <span className={ui.muted} style={{ flex: '0 0 auto', minWidth: 96 }}>{when(e.at)}</span>
            <span style={{ flex: '1 1 200px', minWidth: 0, fontWeight: e.warn ? 700 : 400, color: e.warn ? 'var(--admin-danger, #b42318)' : undefined }}>{e.warn && <ShieldAlert size={14} style={{ verticalAlign: '-2px' }} aria-hidden="true" />} {e.text}</span>
          </div>)}</div> : <p className={ui.muted}>Nothing yet.</p>}
        </div>
        <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy} onClick={signOutEverywhere}><LogOut size={15} /> Sign out everywhere</button>
        </div>
      </div>}
    </div>
  </section>
}
