'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, Mail, MapPin, MessageCircle, ShoppingCart, X } from 'lucide-react'
import { placeLine } from '@/lib/checkout-place'
import { pinMapUrl } from '@/lib/location-pin'
import { money } from '@/lib/config'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { cartLines, displayPhone, unfinishedCheckoutMessage, whatsappChatLink } from '@/lib/checkout-followup'
import { CartReminderSettings } from './admin-operations-hub'
import s from './unfinished-checkouts.module.css'
import ui from './admin-ui.module.css'

type Row = { id: string; name: string | null; phone: string | null; email: string | null; cartJson: string; subtotal: number; currency: string; recoveryUrl: string | null; lastActivity: string; whatsappAt: string | null; reminderState: string | null; reminderAt: string | null; reminderNote: string | null; city: string | null; area: string | null; pinLat: number | null; pinLng: number | null }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.round(hours / 24)} days ago`
}

export default function UnfinishedCheckouts({ initial, recovered, days, storeName, timezone, canManage }: { initial: Row[]; recovered: number; days: number; storeName: string; timezone: string; canManage: boolean }) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function act(id: string, action: 'whatsapp' | 'dismiss') {
    setError(''); setNotice('')
    try {
      const d = await api('/api/admin/abandoned-checkouts', { method: 'PATCH', body: JSON.stringify({ id, action }) })
      if (action === 'dismiss') { setRows(current => current.filter(r => r.id !== id)); setNotice('Removed from the list.') }
      else setRows(current => current.map(r => r.id === id ? { ...r, whatsappAt: d.checkout?.whatsappAt || new Date().toISOString() } : r))
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update') }
  }

  async function sendEmail(id: string) {
    setBusy(id); setError(''); setNotice('')
    try {
      await api('/api/admin/abandoned-checkouts/send-email', { method: 'POST', body: JSON.stringify({ id }) })
      setRows(current => current.map(r => r.id === id ? { ...r, reminderState: 'sent', reminderAt: new Date().toISOString(), reminderNote: null } : r))
      setNotice('Reminder email sent.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send the email') }
    finally { setBusy('') }
  }

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/orders"><ArrowLeft size={15} /> Orders</Link>
    <div>
      <h1 className={s.title}>Unfinished checkouts</h1>
      <p className={s.subtitle}>People who started checkout, gave their phone or email, and left without ordering (last {days} days). A short WhatsApp message often brings them back.</p>
    </div>
    <div className={s.stats}>
      <div><strong>{rows.length}</strong><span>to follow up</span></div>
      <div><strong>{recovered}</strong><span>came back and ordered</span></div>
    </div>
    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

    {!rows.length && <div className={`${ui.card} ${ui.empty}`}><ShoppingCart size={28} /><h3>Nothing to follow up</h3><p className={ui.muted}>When someone leaves checkout after typing their phone number, they show up here.</p></div>}

    <div className={s.list}>
      {rows.map(row => {
        const lines = cartLines(row.cartJson)
        const message = unfinishedCheckoutMessage({ storeName, name: row.name, cartJson: row.cartJson, subtotal: row.subtotal, currency: row.currency, recoveryUrl: row.recoveryUrl }, money)
        const wa = whatsappChatLink(row.phone, message)
        const emailSent = row.reminderState === 'sent'
        return <article key={row.id} className={`${ui.card} ${s.card}`}>
          <div className={s.head}>
            <div>
              <strong className={s.name}>{row.name || 'No name given'}</strong>
              <div className={s.contact}>
                {row.phone && <a href={`tel:+${row.phone}`} dir="ltr">{displayPhone(row.phone)}</a>}
                {row.email && <span>{row.email}</span>}
              </div>
              {(placeLine(row) || row.pinLat !== null) && <div className={s.contact}>
                <span><MapPin size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {placeLine(row) || 'Area not given'}</span>
                {row.pinLat !== null && row.pinLng !== null && <a href={pinMapUrl({ lat: row.pinLat, lng: row.pinLng })} target="_blank" rel="noreferrer">Exact spot on the map</a>}
              </div>}
            </div>
            <div className={s.amount}><strong>{money(row.subtotal, row.currency)}</strong><span title={formatAdminDateTime(row.lastActivity, timezone)}>left {ago(row.lastActivity)}</span></div>
          </div>
          <ul className={s.items}>{lines.slice(0, 6).map((line, i) => <li key={i}>{line.quantity} × {line.name}</li>)}{lines.length > 6 && <li>+ {lines.length - 6} more</li>}</ul>
          {(row.whatsappAt || emailSent) && <p className={s.done}><Check size={14} /> {[row.whatsappAt ? `WhatsApp opened ${ago(row.whatsappAt)}` : '', emailSent ? `Reminder email sent${row.reminderAt ? ` ${ago(row.reminderAt)}` : ''}` : ''].filter(Boolean).join(' · ')}</p>}
          {canManage && <div className={s.actions}>
            {wa && <a className={`${ui.btn} ${s.whatsapp}`} href={wa} target="_blank" rel="noreferrer" onClick={() => act(row.id, 'whatsapp')}><MessageCircle size={16} /> {row.whatsappAt ? 'Message again on WhatsApp' : 'Remind on WhatsApp'}</a>}
            {row.email && !emailSent && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy === row.id} onClick={() => sendEmail(row.id)}><Mail size={15} /> {busy === row.id ? 'Sending…' : 'Send reminder email'}</button>}
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => act(row.id, 'dismiss')}><X size={15} /> Remove</button>
          </div>}
        </article>
      })}
    </div>

    {canManage && <section className={`${ui.card} ${s.settings}`}>
      <h2 className={s.settingsTitle}>Automatic reminder email</h2>
      <CartReminderSettings />
    </section>}
  </div>
}
