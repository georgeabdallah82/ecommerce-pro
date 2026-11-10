'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, ArrowRight, Check, Circle, Rocket, Store } from 'lucide-react'
import ui from './admin-ui.module.css'
import styles from './admin-launch-checklist.module.css'
import type { ChecklistItem } from '@/lib/launch-checklist'

type Props = { initial: { items: ChecklistItem[] }; maintenanceOn: boolean }
type Filter = 'all' | 'todo' | 'ready'

const STATE_LABEL = { ok: 'Ready', warn: 'Needs a look', todo: 'To do' } as const

// Admin > Launch checklist (lib/launch-checklist.ts). Items the store checks itself show a Fix link;
// the few it cannot see have a box to tick.
export default function LaunchChecklist({ initial, maintenanceOn }: Props) {
  const [items, setItems] = useState(initial.items)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const before = useMemo(() => items.filter(i => i.group === 'before'), [items])
  const after = useMemo(() => items.filter(i => i.group === 'after'), [items])
  const done = before.filter(i => i.status === 'ok').length
  const warnings = before.filter(i => i.status === 'warn').length
  const percent = before.length ? Math.round((done / before.length) * 100) : 0
  const allDone = done === before.length
  // The first thing still to do, most urgent first: a problem before a plain to-do.
  const nextStep = useMemo(() => [...before].filter(i => i.status !== 'ok').sort((a, b) => Number(b.status === 'warn') - Number(a.status === 'warn'))[0], [before])

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

  const visible = (list: ChecklistItem[]) => list.filter(i => filter === 'all' || (filter === 'todo' ? i.status !== 'ok' : i.status === 'ok'))

  const row = (item: ChecklistItem) => <li key={item.id} className={`${styles.item} ${styles[item.status]}`}>
    <span className={styles.icon} aria-hidden="true">{item.status === 'ok' ? <Check size={15} /> : item.status === 'warn' ? <AlertTriangle size={15} /> : <Circle size={15} />}</span>
    <div className={styles.text}>
      <strong>{item.title}</strong>
      <span className={ui.muted}>{item.detail}</span>
      <span className={styles.state}>{STATE_LABEL[item.status]}</span>
    </div>
    <div className={styles.action}>
      {item.manual
        ? <button type="button" className={`${ui.btn} ${item.status === 'ok' ? ui.btnSecondary : ''} ${ui.btnSmall}`} disabled={busy === item.id} aria-pressed={item.status === 'ok'} onClick={() => tick(item)}>{item.status === 'ok' ? 'Done · undo' : 'I did this'}</button>
        : item.status !== 'ok' && item.href ? <Link className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={item.href}>Fix</Link> : null}
      {item.manual && item.href ? <Link className={ui.textLink} href={item.href}>{item.fix || 'Open'}</Link> : null}
      {!item.manual && item.status !== 'ok' && item.fix ? <span className={styles.where}>{item.fix}</span> : null}
    </div>
  </li>

  const section = (title: string, list: ChecklistItem[], note?: string) => {
    const shown = visible(list)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const readyCount = list.filter(i => i.status === 'ok').length
    return <section className={ui.card} aria-labelledby={`launch-${slug}`}>
      <div className={styles.sectionHead}>
        <h2 id={`launch-${slug}`} className={styles.heading}>{title}</h2>
        <span className={styles.sectionCount}>{readyCount} of {list.length} ready</span>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      {shown.length
        ? <ul className={styles.list}>{shown.map(row)}</ul>
        : <p className={styles.empty}>{filter === 'todo' ? 'Nothing left to do here.' : 'Nothing ready yet.'}</p>}
    </section>
  }

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>BEFORE YOU OPEN</span>
        <h1 className={ui.title}>Launch checklist</h1>
        <p className={ui.muted}>What is ready and what is missing before visitors see your store. Most items tick themselves.</p>
      </div>
    </div>

    <section className={`${ui.card} ${styles.summary}`} aria-live="polite">
      <div className={styles.summaryTop}>
        <Rocket size={22} aria-hidden="true" />
        <div>
          <strong className={styles.big}>{done} of {before.length} ready</strong>
          <span className={ui.muted}>{!maintenanceOn ? 'Your store is open to visitors.' : allDone ? 'Everything is ready. Turn maintenance mode off to open the store.' : 'Your store is still hidden from visitors.'}</span>
        </div>
        <div className={styles.counts} aria-label="Status counts">
          <span className={styles.countOk}><strong>{done}</strong> ready</span>
          <span className={styles.countWarn}><strong>{warnings}</strong> need a look</span>
          <span className={styles.countTodo}><strong>{before.length - done - warnings}</strong> to do</span>
        </div>
      </div>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={before.length} aria-valuenow={done} aria-label="Launch checklist progress"><span style={{ width: `${percent}%` }} /></div>

      {!allDone && nextStep && <div className={styles.nextStep}>
        <div>
          <span className={styles.nextLabel}>Next step</span>
          <strong>{nextStep.title}</strong>
          <span className={ui.muted}>{nextStep.fix || nextStep.detail}</span>
        </div>
        {nextStep.href && <Link className={`${ui.btn} ${ui.btnSmall}`} href={nextStep.href}>{nextStep.manual ? 'Open' : 'Fix it'} <ArrowRight size={14} /></Link>}
      </div>}

      {allDone && maintenanceOn && <div className={styles.nextStep}>
        <div>
          <span className={styles.nextLabel}>Ready to open</span>
          <strong>Everything on the checklist is ready</strong>
          <span className={ui.muted}>Turn maintenance mode off in Settings → Maintenance when you are ready for visitors.</span>
        </div>
        <Link className={`${ui.btn} ${ui.btnSmall}`} href="/admin/settings"><Store size={14} /> Open Settings</Link>
      </div>}
    </section>

    <div className={styles.filters} role="group" aria-label="Filter checklist">
      {([
        { id: 'all', label: 'All', count: items.length },
        { id: 'todo', label: 'To do', count: items.filter(i => i.status !== 'ok').length },
        { id: 'ready', label: 'Ready', count: items.filter(i => i.status === 'ok').length },
      ] as { id: Filter; label: string; count: number }[]).map(f => (
        <button key={f.id} type="button" className={`${styles.filterBtn} ${filter === f.id ? styles.filterOn : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
          {f.label} <span>{f.count}</span>
        </button>
      ))}
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

    {section('Before you open', before)}
    {section('Soon after you open', after, 'These help you grow, but the store can open without them.')}
  </div>
}
