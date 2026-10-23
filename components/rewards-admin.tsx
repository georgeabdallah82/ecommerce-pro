'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { Check, Gift, MessageCircle } from 'lucide-react'
import { formatAdminDate } from '@/lib/admin-datetime'
import { displayPhone, whatsappChatLink } from '@/lib/checkout-followup'
import { LIMITS, rewardMessage, type CodeState, type RewardCustomer, type RewardsConfig } from '@/lib/rewards-shared'
import s from './bring-back.module.css'
import x from './rewards-admin.module.css'
import ui from './admin-ui.module.css'

type Made = { code: string; phone: string; name: string; createdAt: string; percent: number; expiresAt: string | null; state: CodeState }
const STATE_WORDS: Record<CodeState, string> = { unused: 'Not used yet', used: 'Used', expired: 'Expired', off: 'Switched off' }

// Admin > Marketing > Rewards (app/admin/marketing/rewards).
export default function RewardsAdmin({ config: saved, due: initialDue, made: initialMade, storeName, siteUrl, timezone, canManage }: { config: RewardsConfig; due: RewardCustomer[]; made: Made[]; storeName: string; siteUrl: string; timezone: string; canManage: boolean }) {
  const [config, setConfig] = useState(saved)
  const [draft, setDraft] = useState({ everyOrders: String(saved.everyOrders), percent: String(saved.percent), days: String(saved.days) })
  const [due, setDue] = useState(initialDue)
  const [made, setMade] = useState(initialMade)
  const [busy, setBusy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dirty = draft.everyOrders !== String(config.everyOrders) || draft.percent !== String(config.percent) || draft.days !== String(config.days)
  const num = (value: string) => value.replace(/[^\d]/g, '').slice(0, 3)

  async function save(next: RewardsConfig) {
    setSaving(true); setError(''); setNotice('')
    try {
      const r = await fetch('/api/admin/rewards', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save')
      setConfig(d.config); setDraft({ everyOrders: String(d.config.everyOrders), percent: String(d.config.percent), days: String(d.config.days) })
      setNotice(d.config.enabled ? 'Saved. Rewards are on. Reload the page to see who has earned one with the new numbers.' : 'Saved. Rewards are off.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') }
    finally { setSaving(false) }
  }

  const messageFor = (code: string, phone: string, name: string, delivered: number, percent: number) => whatsappChatLink(phone, rewardMessage({ storeName, name, code, percent, days: config.days, delivered, siteUrl }))

  async function makeCode(customer: RewardCustomer) {
    setBusy(customer.phone); setError(''); setNotice('')
    // Opened now, inside the tap, so the phone does not block it; sent to WhatsApp once the code exists.
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
    try {
      const r = await fetch('/api/admin/rewards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: customer.phone }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to make the code')
      const href = messageFor(d.code, customer.phone, customer.name, customer.delivered, d.percent)
      if (win && href) win.location.href = href; else win?.close()
      setMade(list => [{ code: d.code, phone: customer.phone, name: customer.name, createdAt: new Date().toISOString(), percent: d.percent, expiresAt: d.expiresAt, state: 'unused' as CodeState }, ...list])
      setDue(list => list.flatMap(c => c.phone !== customer.phone ? [c] : c.due > 1 ? [{ ...c, due: c.due - 1, given: c.given + 1, nextMilestone: c.nextMilestone + 1 }] : []))
      setNotice(`Code ${d.code} made for ${customer.name || displayPhone(customer.phone)}. ${win ? 'WhatsApp is opening.' : 'Tap "Send on WhatsApp" below.'}`)
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : 'Unable to make the code')
    } finally { setBusy('') }
  }

  const unused = made.filter(m => m.state === 'unused').length

  return <div className={s.page}>
    <div>
      <h1 className={s.title}>Rewards</h1>
      <p className={s.subtitle}>Thank your regular customers. After every {config.everyOrders} delivered orders, a customer earns a one-use code for {config.percent}% off. You send it on WhatsApp with one tap. Customers are matched by phone number, so it works without an account.</p>
    </div>

    <section className={`${ui.card} ${x.switchCard}`}>
      <div>
        <strong>Give rewards to regular customers</strong>
        <p className={ui.muted}>{config.enabled ? 'On: customers who reach the number of delivered orders show below.' : 'Off: nothing is offered. You can still set the numbers first.'}</p>
      </div>
      <button type="button" role="switch" aria-checked={config.enabled} aria-label="Give rewards to regular customers" disabled={!canManage || saving} className={`${x.switch} ${config.enabled ? x.on : ''}`} onClick={() => save({ ...config, enabled: !config.enabled })}><i /></button>
    </section>

    <section className={`${ui.card} ${s.settings}`}>
      <h2 className={s.settingsTitle}>The reward</h2>
      <div className={x.fields}>
        <label><span className={ui.fieldLabel}>Delivered orders needed</span><input className={ui.input} inputMode="numeric" value={draft.everyOrders} disabled={!canManage} aria-label="Delivered orders needed" onChange={e => setDraft(d => ({ ...d, everyOrders: num(e.target.value) }))} placeholder="5" /><small className={ui.muted}>{LIMITS.everyOrders[0]} to {LIMITS.everyOrders[1]}</small></label>
        <label><span className={ui.fieldLabel}>Discount (%)</span><input className={ui.input} inputMode="numeric" value={draft.percent} disabled={!canManage} aria-label="Discount percent" onChange={e => setDraft(d => ({ ...d, percent: num(e.target.value) }))} placeholder="10" /><small className={ui.muted}>{LIMITS.percent[0]} to {LIMITS.percent[1]}</small></label>
        <label><span className={ui.fieldLabel}>Code valid for (days)</span><input className={ui.input} inputMode="numeric" value={draft.days} disabled={!canManage} aria-label="Code valid for days" onChange={e => setDraft(d => ({ ...d, days: num(e.target.value) }))} placeholder="60" /><small className={ui.muted}>{LIMITS.days[0]} to {LIMITS.days[1]}</small></label>
      </div>
      {canManage && <div className={s.row}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={saving || !dirty} onClick={() => save({ enabled: config.enabled, everyOrders: Number(draft.everyOrders), percent: Number(draft.percent), days: Number(draft.days) })}>{saving ? 'Saving…' : 'Save'}</button></div>}
      <p className={ui.muted}>Each code works once. Only delivered orders count (not cancelled or refused ones). The codes are normal discounts: see them in <Link className={ui.textLink} href="/admin/coupons">Discounts</Link>.</p>
    </section>

    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    <div className={s.stats}>
      <div><strong>{due.reduce((sum, c) => sum + c.due, 0)}</strong><span>rewards waiting to send</span></div>
      <div><strong>{made.length}</strong><span>codes made</span></div>
      <div><strong>{unused}</strong><span>not used yet</span></div>
    </div>

    <h2 className={x.heading}>Waiting for a thank-you</h2>
    {!due.length ? <div className={`${ui.card} ${ui.empty}`}><Gift size={28} /><h3>Nobody is waiting</h3><p className={ui.muted}>{config.enabled ? `When a customer reaches ${config.everyOrders} delivered orders, they show up here.` : 'Switch rewards on, then customers who reached the number show up here.'}</p></div>
      : <div className={s.list}>{due.map(c => <article key={c.phone} className={`${ui.card} ${s.card}`}>
        <div className={s.head}>
          <div>
            <strong className={s.name}>{c.name || 'Customer'}</strong>
            <div className={s.meta}><a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(c.phone)}</a><span>{c.delivered} delivered orders</span>{c.due > 1 && <span>{c.due} rewards waiting</span>}</div>
          </div>
        </div>
        {canManage && <div className={s.actions}>
          <button type="button" className={`${ui.btn} ${s.whatsapp}`} disabled={!!busy || !config.enabled} onClick={() => makeCode(c)}><MessageCircle size={16} /> {busy === c.phone ? 'Making the code…' : 'Make the code and send on WhatsApp'}</button>
        </div>}
        {!config.enabled && <p className={s.wait}>Switch rewards on first.</p>}
      </article>)}</div>}

    {made.length > 0 && <>
      <h2 className={x.heading}>Codes made</h2>
      <div className={s.list}>{made.map(m => <article key={m.code} className={`${ui.card} ${s.card}`}>
        <div className={s.head}>
          <div>
            <strong className={s.name}><span className={s.code}>{m.code}</span> <span className={ui.muted}>· {m.percent}% off, one use</span></strong>
            <div className={s.meta}><span>{m.name || 'Customer'}</span><a href={`https://wa.me/${m.phone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(m.phone)}</a><span>made {formatAdminDate(m.createdAt, timezone)}</span></div>
          </div>
        </div>
        <p className={m.state === 'used' ? s.done : s.wait}>{m.state === 'used' && <Check size={15} />} {STATE_WORDS[m.state]}{m.state === 'unused' && m.expiresAt ? ` · valid until ${formatAdminDate(m.expiresAt, timezone)}` : ''}</p>
        {m.state === 'unused' && <div className={s.actions}><a className={`${ui.btn} ${s.whatsapp}`} href={messageFor(m.code, m.phone, m.name, 0, m.percent)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send on WhatsApp again</a></div>}
      </article>)}</div>
    </>}
  </div>
}
