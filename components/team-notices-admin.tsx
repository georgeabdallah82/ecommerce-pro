'use client'

import { useState } from 'react'
import { Bell, Megaphone, Trash2 } from 'lucide-react'
import { DEFAULT_KEEP, KEEP_CHOICES, MAX_ACTIVE, MAX_NOTICE_TEXT, isActive, noticeAge, type KeepChoice, type Notice } from '@/lib/team-notices'
import s from './team-notices-admin.module.css'
import ui from './admin-ui.module.css'

// Admin > Team notices: write a notice for the staff, and remove old ones (lib/team-notices.ts).

async function api(method: 'POST' | 'DELETE', body: unknown) {
  const response = await fetch('/api/admin/notices', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to save the notice')
  return data as { notices: Notice[] }
}

export default function TeamNoticesAdmin({ initial, canManage }: { initial: Notice[]; canManage: boolean }) {
  const [notices, setNotices] = useState(initial)
  const [text, setText] = useState('')
  const [keep, setKeep] = useState<KeepChoice>(DEFAULT_KEEP)
  const [alert, setAlert] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const now = new Date()
  const showing = notices.filter(n => isActive(n, now))
  const past = notices.filter(n => !isActive(n, now))

  async function post(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('POST', { text, keep, alert })
      setNotices(data.notices); setText('')
      setMessage(alert ? 'Posted. It shows on every admin page, and a phone alert went to staff who turned notifications on.' : 'Posted. It shows on every admin page.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the notice') } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError(''); setMessage('')
    try { const data = await api('DELETE', { id }); setNotices(data.notices); setMessage('Removed.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to remove the notice') } finally { setBusy(false) }
  }

  const row = (n: Notice, active: boolean) => <li key={n.id} className={s.row}>
    <div className={s.rowText}>
      <p>{n.text}</p>
      <span>{n.authorName} · {noticeAge(n.createdAt, now)} · {active ? (n.expiresAt ? `shows until ${new Date(n.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'stays until removed') : 'expired'}{n.alerted ? ' · phone alert sent' : ''}</span>
    </div>
    {canManage && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${s.remove}`} disabled={busy} onClick={() => remove(n.id)} aria-label={`Remove notice: ${n.text.slice(0, 40)}`}><Trash2 size={15} aria-hidden="true" />Remove</button>}
  </li>

  return <div className={s.page}>
    {canManage ? <form className={`${ui.card} ${s.card}`} onSubmit={post}>
      <h2 className={s.h2}><Megaphone size={17} aria-hidden="true" /> New notice</h2>
      <label className={ui.fieldLabel} htmlFor="notice-text">Message for the team</label>
      <textarea id="notice-text" className={ui.textarea} rows={3} maxLength={MAX_NOTICE_TEXT} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. No deliveries on Sunday. Please confirm all orders before 5 pm." />
      <div className={s.count} aria-live="polite">{text.length} / {MAX_NOTICE_TEXT}</div>
      <div className={s.options}>
        <label className={s.option}><span className={ui.fieldLabel}>Keep it up for</span>
          <select className={ui.select} value={keep} onChange={e => setKeep(e.target.value as KeepChoice)}>{KEEP_CHOICES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </label>
        <label className={s.check}><input type="checkbox" checked={alert} onChange={e => setAlert(e.target.checked)} /><span><Bell size={15} aria-hidden="true" /> Send a phone alert to the team now</span></label>
      </div>
      <button type="submit" className={ui.btn} disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post notice'}</button>
    </form> : null}
    {(error || message) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || message}</div>}

    <section className={`${ui.card} ${s.card}`} aria-labelledby="notices-showing">
      <h2 id="notices-showing" className={s.h2}>Showing now <small>({showing.length} of {MAX_ACTIVE})</small></h2>
      {showing.length ? <ul className={s.list}>{showing.map(n => row(n, true))}</ul> : <p className={s.none}>No notice is showing. Staff see nothing at the top of the admin.</p>}
    </section>
    {past.length ? <section className={`${ui.card} ${s.card}`} aria-labelledby="notices-past">
      <h2 id="notices-past" className={s.h2}>Earlier notices</h2>
      <ul className={s.list}>{past.slice(0, 10).map(n => row(n, false))}</ul>
    </section> : null}
  </div>
}
