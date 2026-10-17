'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, Check, Circle, Rocket } from 'lucide-react'
import ui from './admin-ui.module.css'
import styles from './admin-launch-checklist.module.css'
import type { ChecklistItem } from '@/lib/launch-checklist'

type Props = { initial: { items: ChecklistItem[] }; maintenanceOn: boolean }

// Admin > Launch checklist (lib/launch-checklist.ts). Items the store checks itself show a Fix link;
// the few it cannot see have a box to tick.
export default function LaunchChecklist({ initial, maintenanceOn }: Props) {
  const [items, setItems] = useState(initial.items)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const before = useMemo(() => items.filter(i => i.group === 'before'), [items])
  const after = useMemo(() => items.filter(i => i.group === 'after'), [items])
  const done = before.filter(i => i.status === 'ok').length
  const percent = before.length ? Math.round((done / before.length) * 100) : 0
  const allDone = done === before.length

  async function tick(item: ChecklistItem) {
    const next = item.status !== 'ok'
    setBusy(item.id); setError('')
    setItems(list => list.map(i => i.id === item.id ? { ...i, status: next ? 'ok' : 'todo' } : i))
    try {
      const r = await fetch('/api/admin/launch-checklist', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, done: next }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
    } catch (e) {
      setItems(list => list.map(i => i.id === item.id ? { ...i, status: item.status } : i))
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally { setBusy('') }
  }

  const row = (item: ChecklistItem) => <li key={item.id} className={`${styles.item} ${styles[item.status]}`}>
    <span className={styles.icon} aria-hidden="true">{item.status === 'ok' ? <Check size={15} /> : item.status === 'warn' ? <AlertTriangle size={15} /> : <Circle size={15} />}</span>
    <div className={styles.text}>
      <strong>{item.title}</strong>
      <span className={ui.muted}>{item.detail}</span>
      <span className={styles.state}>{item.status === 'ok' ? 'Ready' : item.status === 'warn' ? 'Needs a look' : 'To do'}</span>
    </div>
    <div className={styles.action}>
      {item.manual
        ? <button type="button" className={`${ui.btn} ${item.status === 'ok' ? ui.btnSecondary : ''} ${ui.btnSmall}`} disabled={busy === item.id} aria-pressed={item.status === 'ok'} onClick={() => tick(item)}>{item.status === 'ok' ? 'Done · undo' : 'I did this'}</button>
        : item.status !== 'ok' && item.href ? <Link className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={item.href}>Fix</Link> : null}
      {item.manual && item.href ? <Link className={ui.textLink} href={item.href}>{item.fix || 'Open'}</Link> : null}
      {!item.manual && item.status !== 'ok' && item.fix ? <span className={styles.where}>{item.fix}</span> : null}
    </div>
  </li>

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>BEFORE YOU OPEN</span><h1 className={ui.title}>Launch checklist</h1><p className={ui.muted}>What is ready and what is missing before visitors see your store. Most items tick themselves.</p></div>
    </div>

    <section className={`${ui.card} ${styles.summary}`} aria-live="polite">
      <div className={styles.summaryTop}>
        <Rocket size={22} aria-hidden="true" />
        <div>
          <strong className={styles.big}>{done} of {before.length} ready</strong>
          <span className={ui.muted}>{!maintenanceOn ? 'Your store is open to visitors.' : allDone ? 'Everything is ready. Turn maintenance mode off to open the store.' : 'Your store is still hidden from visitors.'}</span>
        </div>
      </div>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={before.length} aria-valuenow={done} aria-label="Launch checklist progress"><span style={{ width: `${percent}%` }} /></div>
    </section>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

    <section className={ui.card}>
      <h2 className={styles.heading}>Before you open</h2>
      <ul className={styles.list}>{before.map(row)}</ul>
    </section>

    <section className={ui.card}>
      <h2 className={styles.heading}>Soon after you open</h2>
      <ul className={styles.list}>{after.map(row)}</ul>
    </section>
  </div>
}
