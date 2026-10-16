'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { Check, HeartHandshake, MessageCircle } from 'lucide-react'
import { money } from '@/lib/config'
import { formatAdminDate } from '@/lib/admin-datetime'
import { displayPhone, whatsappChatLink } from '@/lib/checkout-followup'
import { WINBACK_DAYS, WINBACK_QUIET_DAYS, winbackMessage, type WinbackCustomer } from '@/lib/winback'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

type Row = WinbackCustomer & { contactedAt: string | null }

// Admin > Marketing > Win back (app/admin/marketing/win-back).
export default function WinbackAdmin({ initial, total, hidden, days, showAll, code: savedCode, storeName, siteUrl, timezone, canManage }: { initial: Row[]; total: number; hidden: number; days: number; showAll: boolean; code: string; storeName: string; siteUrl: string; timezone: string; canManage: boolean }) {
  const [rows, setRows] = useState(initial)
  const [code, setCode] = useState(savedCode)
  const [draft, setDraft] = useState(savedCode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function saveCode() {
    setSaving(true); setError(''); setNotice('')
    try {
      const r = await fetch('/api/admin/winback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: draft }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save')
      setCode(d.code || ''); setDraft(d.code || '')
      setNotice(d.code ? `Messages now mention code ${d.code}.` : 'Messages no longer mention a code.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') }
    finally { setSaving(false) }
  }

  // The link opens WhatsApp straight away; noting it here runs alongside.
  function messaged(phone: string) {
    const at = new Date().toISOString()
    setRows(current => current.map(r => r.phone === phone ? { ...r, contactedAt: at } : r))
    fetch('/api/admin/winback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }), keepalive: true }).catch(() => {})
  }

  const query = (d: number, all: boolean) => `/admin/marketing/win-back?days=${d}${all ? '&all=1' : ''}`

  return <div className={s.page}>
    <div>
      <h1 className={s.title}>Win back</h1>
      <p className={s.subtitle}>Customers who received at least one order and have not ordered for {days} days or more, best customers first. A friendly WhatsApp message often brings them back.</p>
    </div>
    <div className={s.chips} role="group" aria-label="Last order more than">
      {WINBACK_DAYS.map(d => <Link key={d} className={`${s.chip}${d === days ? ` ${s.chipOn}` : ''}`} href={query(d, showAll)}>{d}+ days</Link>)}
    </div>
    <section className={`${ui.card} ${s.settings}`}>
      <h2 className={s.settingsTitle}>Discount code in the message (optional)</h2>
      <p className={ui.muted}>Create it first in <Link className={ui.textLink} href="/admin/coupons">Discounts</Link>, for example COMEBACK10. Leave empty to send a message without a code.</p>
      {canManage && <div className={s.row}>
        <input className={ui.input} value={draft} onChange={e => setDraft(e.target.value.toUpperCase().replace(/\s+/g, ''))} placeholder="e.g. COMEBACK10" aria-label="Discount code" maxLength={40} />
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={saveCode} disabled={saving || draft === code}>{saving ? 'Saving…' : 'Save'}</button>
      </div>}
    </section>
    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className={s.stats}>
      <div><strong>{total}</strong><span>customers to win back</span></div>
      <div><strong>{rows.filter(r => r.contactedAt).length}</strong><span>messaged (shown)</span></div>
    </div>
    {hidden > 0 && <p className={ui.muted}>{hidden} customer{hidden === 1 ? '' : 's'} messaged in the last {WINBACK_QUIET_DAYS} days {hidden === 1 ? 'is' : 'are'} hidden. <Link className={ui.textLink} href={query(days, true)}>Show everyone</Link></p>}
    {showAll && <p className={ui.muted}><Link className={ui.textLink} href={query(days, false)}>Hide customers messaged in the last {WINBACK_QUIET_DAYS} days</Link></p>}
    {!rows.length ? <div className={`${ui.card} ${ui.empty}`}><HeartHandshake size={28} /><h3>Nobody to win back</h3><p className={ui.muted}>Every customer ordered in the last {days} days, or was messaged recently.</p></div>
      : <div className={s.list}>{rows.map(row => {
        const href = whatsappChatLink(row.phone, winbackMessage({ storeName, name: row.name, code, siteUrl }))
        return <article key={row.phone} className={`${ui.card} ${s.card}`}>
          <div className={s.head}>
            <div>
              <strong className={s.name}>{row.name || 'Customer'}</strong>
              <div className={s.meta}><span dir="ltr">{displayPhone(row.phone)}</span><span>{row.delivered} order{row.delivered === 1 ? '' : 's'} received</span></div>
            </div>
            <div className={s.amount}><strong>{money(row.spent, row.currency)}</strong><span>last order {row.daysSince} days ago</span></div>
          </div>
          <p className={s.note}>Last order <Link className={ui.textLink} href={`/admin/orders/${row.lastOrderId}`}>#{row.lastOrderNumber}</Link> on {formatAdminDate(row.lastOrderAt, timezone)}</p>
          {row.contactedAt && <p className={s.done}><Check size={15} /> Messaged on {formatAdminDate(row.contactedAt, timezone)}</p>}
          {canManage && <div className={s.actions}><a className={`${ui.btn} ${s.whatsapp}`} href={href} target="_blank" rel="noreferrer" onClick={() => messaged(row.phone)}><MessageCircle size={16} /> {row.contactedAt ? 'Message again' : 'Message on WhatsApp'}</a></div>}
        </article>
      })}</div>}
  </div>
}
