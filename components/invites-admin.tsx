'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { Check, Clock, Gift, MessageCircle, Settings2, UserPlus } from 'lucide-react'
import { formatAdminDate } from '@/lib/admin-datetime'
import { displayPhone } from '@/lib/checkout-followup'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

export type InviteRow = {
  orderId: string; orderNumber: string; status: string; total: string; createdAt: string; friend: string
  code: string; inviterPhone: string; inviterName: string
  rewardCode: string | null; rewardUsed: boolean; whatsappHref: string
}

const statusText = (status: string) => status.charAt(0) + status.slice(1).toLowerCase()

// Admin > Marketing > Invite a friend (app/admin/marketing/invites).
export default function InvitesAdmin({ initial, codes, enabled, friendPercent, reward, timezone, canManage }: { initial: InviteRow[]; codes: number; enabled: boolean; friendPercent: number; reward: string; timezone: string; canManage: boolean }) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function makeReward(orderId: string) {
    setBusy(orderId); setError('')
    try {
      const r = await fetch('/api/admin/invites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to make the code')
      setRows(current => current.map(row => row.orderId === orderId ? { ...row, rewardCode: d.rewardCode, whatsappHref: d.whatsappHref || '' } : row))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to make the code')
    } finally {
      setBusy('')
    }
  }

  const delivered = rows.filter(r => r.status === 'DELIVERED').length
  const rewarded = rows.filter(r => r.rewardCode).length
  const waiting = rows.filter(r => r.status === 'DELIVERED' && !r.rewardCode).length

  return <div className={s.page}>
    <div>
      <h1 className={s.title}>Invite a friend</h1>
      <p className={s.subtitle}>Customers share their own code from the thank-you page. Friends get {friendPercent}% off their first order. When a friend&apos;s order is delivered, send the customer their thank-you code{reward ? ` (${reward} off)` : ''} on WhatsApp.</p>
    </div>
    {!enabled && <div className={ui.alert}>Invite a friend is off. Turn it on in <Link className={ui.textLink} href="/admin/settings">Settings &gt; Selling tools</Link>: choose the friend&apos;s discount and the thank-you amount.</div>}
    {enabled && !reward && <div className={ui.alert}>Set the thank-you amount in <Link className={ui.textLink} href="/admin/settings">Settings &gt; Selling tools</Link> to give inviters a code.</div>}
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    <div className={s.stats}>
      <div><strong>{codes}</strong><span>customers with a code</span></div>
      <div><strong>{rows.length}</strong><span>friends&apos; orders</span></div>
      <div><strong>{delivered}</strong><span>delivered</span></div>
      <div><strong>{waiting}</strong><span>waiting for a thank-you</span></div>
      <div><strong>{rewarded}</strong><span>thank-you codes sent</span></div>
    </div>
    {!rows.length ? <div className={`${ui.card} ${ui.empty}`}><UserPlus size={28} /><h3>No friends&apos; orders yet</h3><p className={ui.muted}>When someone orders with a customer&apos;s invite code, it shows up here.</p></div>
      : <div className={s.list}>{rows.map(row => <article key={row.orderId} className={`${ui.card} ${s.card}`}>
        <div className={s.head}>
          <div>
            <strong className={s.name}>{row.friend || 'Friend'} <span className={ui.muted}>· order <Link className={ui.textLink} href={`/admin/orders/${row.orderId}`}>#{row.orderNumber}</Link></span></strong>
            <div className={s.meta}><span>Invited by <strong>{row.inviterName || 'a customer'}</strong></span><a href={`https://wa.me/${row.inviterPhone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(row.inviterPhone)}</a><span>code <span className={s.code}>{row.code}</span></span></div>
          </div>
          <div className={s.amount}><strong>{row.total}</strong><span>{statusText(row.status)} · {formatAdminDate(row.createdAt, timezone)}</span></div>
        </div>
        {row.rewardCode
          ? <>
            <p className={s.done}><Check size={15} /> Thank-you code <span className={s.code}>{row.rewardCode}</span>{row.rewardUsed ? ' (already used)' : ''}</p>
            {row.whatsappHref && <div className={s.actions}><a className={`${ui.btn} ${s.whatsapp}`} href={row.whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send it on WhatsApp</a></div>}
          </>
          : row.status === 'DELIVERED'
            ? canManage && <div className={s.actions}>
              <button type="button" className={ui.btn} disabled={!!busy || !reward} onClick={() => makeReward(row.orderId)}><Gift size={16} /> {busy === row.orderId ? 'Making the code…' : 'Make thank-you code'}</button>
              {!reward && <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/settings"><Settings2 size={16} /> Set the amount</Link>}
            </div>
            : row.status === 'CANCELLED'
              ? <p className={s.wait}>Cancelled: no thank-you code.</p>
              : <p className={s.wait}><Clock size={15} /> Thank-you code once this order is delivered.</p>}
      </article>)}</div>}
  </div>
}
