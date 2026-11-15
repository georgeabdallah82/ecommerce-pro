'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, Copy, ExternalLink, MessageCircle, RefreshCw, Trash2, Truck, UserPlus, Wallet } from 'lucide-react'
import { money } from '@/lib/config'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { displayPhone, whatsappChatLink } from '@/lib/checkout-followup'
import { driverWelcomeMessage } from '@/lib/drivers-shared'
import { useConfirm } from './admin-confirm'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

export type DriverRow = {
  id: string; name: string; phone: string; active: boolean; link: string; expiresAt: string | null
  outCount: number; outCollect: number
  cash: Array<{ id: string; orderNumber: string; amount: number; deliveredAt: string }>
  delivered30: number; currency: string
}

async function api(path: string, method: string, body: unknown) {
  const r = await fetchRead(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// Admin > Orders > Drivers (app/admin/orders/drivers).
export default function DriversAdmin({ initial, storeName, timezone, canManage }: { initial: DriverRow[]; storeName: string; timezone: string; canManage: boolean }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState(initial)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function add() {
    setBusy('add'); setError(''); setNotice('')
    try {
      const { driver } = await api('/api/admin/drivers', 'POST', { name, phone })
      setRows(current => [...current, { id: driver.id, name: driver.name, phone: driver.phone || '', active: true, link: `${window.location.origin}/driver/${driver.token}`, expiresAt: driver.tokenExpiresAt ?? null, outCount: 0, outCollect: 0, cash: [], delivered30: 0, currency: 'USD' }])
      setName(''); setPhone('')
      setNotice(`${driver.name} added. Send them their link with the WhatsApp button.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add the driver') }
    finally { setBusy('') }
  }

  async function update(row: DriverRow, data: Record<string, unknown>, message: string) {
    setBusy(row.id); setError(''); setNotice('')
    try {
      const { driver } = await api('/api/admin/drivers', 'PATCH', { id: row.id, ...data })
      setRows(current => current.map(r => r.id === row.id ? { ...r, name: driver.name, phone: driver.phone || '', active: driver.active, link: `${window.location.origin}/driver/${driver.token}`, expiresAt: driver.tokenExpiresAt ?? r.expiresAt } : r))
      setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the driver') }
    finally { setBusy('') }
  }

  async function newLink(row: DriverRow) {
    if (!await confirm({ title: `New link for ${row.name}?`, message: 'The old link stops working right away. Send the new one to the driver.', confirmLabel: 'Make a new link', tone: 'default' })) return
    await update(row, { newLink: true }, `New link made for ${row.name}. Send it with the WhatsApp button.`)
  }

  async function received(row: DriverRow) {
    const amount = row.cash.reduce((sum, c) => sum + c.amount, 0)
    if (!await confirm({ title: `Got ${money(amount, row.currency)} from ${row.name}?`, message: `Cash from ${row.cash.length} deliver${row.cash.length === 1 ? 'y' : 'ies'}: ${row.cash.map(c => `#${c.orderNumber}`).join(', ')}.`, confirmLabel: 'Cash received', tone: 'default' })) return
    setBusy(row.id); setError(''); setNotice('')
    try {
      const d = await api('/api/admin/drivers/settle', 'POST', { driverId: row.id, orderIds: row.cash.map(c => c.id) })
      setRows(current => current.map(r => r.id === row.id ? { ...r, cash: [] } : r))
      setNotice(`${money(d.amount, row.currency)} from ${row.name} marked as received.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') }
    finally { setBusy('') }
  }

  async function remove(row: DriverRow) {
    if (!await confirm({ title: `Delete ${row.name}?`, message: 'Their link stops working for good. Orders given to them and not delivered yet go back to the delivery sheet without a driver. Past deliveries stay in each order\'s history. To stop them for a while instead, use Turn off.', confirmLabel: 'Delete driver' })) return
    setBusy(row.id); setError(''); setNotice('')
    try {
      const r = await fetch(`/api/admin/drivers?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to delete the driver')
      setRows(current => current.filter(r => r.id !== row.id))
      setNotice(`${row.name} was deleted.${d.openOrders ? ` ${d.openOrders} open order${d.openOrders === 1 ? ' is' : 's are'} back on the delivery sheet without a driver.` : ''}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete the driver') }
    finally { setBusy('') }
  }

  const copy = async (row: DriverRow) => { try { await navigator.clipboard.writeText(row.link); setCopied(row.id); setTimeout(() => setCopied(''), 1500) } catch {} }
  const totalCash = rows.reduce((sum, r) => sum + r.cash.reduce((a, c) => a + c.amount, 0), 0)

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/orders/deliveries"><ArrowLeft size={15} /> Delivery sheet</Link>
    <div>
      <h1 className={s.title}>Drivers</h1>
      <p className={s.subtitle}>Each driver gets a private link to their own delivery list. They tap &quot;Delivered&quot; when the customer has the parcel, and you see here the cash each one collected and still has to give you.</p>
    </div>
    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    {totalCash > 0 && <div className={s.stats}><div><strong>{money(totalCash, rows.find(r => r.cash.length)?.currency || 'USD')}</strong><span>cash with drivers, not handed over yet</span></div></div>}

    {canManage && <section className={`${ui.card} ${s.settings}`}>
      <h2 className={s.settingsTitle}>Add a driver</h2>
      <div className={s.row}>
        <input className={ui.input} value={name} onChange={e => setName(e.target.value)} placeholder="Name, e.g. Ali" maxLength={60} aria-label="Driver's name" />
        <input className={ui.input} type="tel" inputMode="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp, e.g. 70 123 456" aria-label="Driver's WhatsApp number" />
        <button type="button" className={ui.btn} disabled={busy === 'add' || !name.trim()} onClick={add}><UserPlus size={16} /> {busy === 'add' ? 'Adding…' : 'Add'}</button>
      </div>
    </section>}

    {!rows.length ? <div className={`${ui.card} ${ui.empty}`}><Truck size={28} /><h3>No drivers yet</h3><p className={ui.muted}>Add the people who deliver your orders. Then choose the driver on the delivery sheet.</p></div>
      : <div className={s.list}>{rows.map(row => {
        const cash = row.cash.reduce((sum, c) => sum + c.amount, 0)
        const welcome = row.phone ? whatsappChatLink(row.phone, driverWelcomeMessage({ storeName, name: row.name, link: row.link })) : ''
        return <article key={row.id} className={`${ui.card} ${s.card}`} style={row.active ? undefined : { opacity: .6 }}>
          <div className={s.head}>
            <div>
              <strong className={s.name}>{row.name}{!row.active && <span className={ui.muted}> · turned off</span>}</strong>
              <div className={s.meta}>{row.phone ? <a href={`https://wa.me/${row.phone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(row.phone)}</a> : <span>No phone</span>}<span>{row.delivered30} delivered in 30 days</span></div>
            </div>
            {row.active && row.expiresAt && (new Date(row.expiresAt) <= new Date()
              ? <p className={s.note}>{row.name}&apos;s link has expired. Make a new one so they can open their list.</p>
              : <p className={s.meta}>Link works until {new Date(row.expiresAt).toLocaleDateString('en-GB')}</p>)}
            <div className={s.amount}><strong>{row.outCount} out now</strong><span>{row.outCollect ? `${money(row.outCollect, row.currency)} to collect` : 'nothing to collect'}</span></div>
          </div>
          {cash > 0 ? <div className={s.note}><Wallet size={15} style={{ verticalAlign: '-2px' }} /> <strong>{money(cash, row.currency)}</strong> collected, not handed over yet ({row.cash.map(c => `#${c.orderNumber} ${formatAdminDateTime(c.deliveredAt, timezone, { day: 'numeric', month: 'short' })}`).join(', ')})</div>
            : <p className={s.done}><Check size={15} /> No cash waiting from {row.name}</p>}
          {canManage && <div className={s.actions}>
            {cash > 0 && <button type="button" className={ui.btn} disabled={busy === row.id} onClick={() => received(row)}><Wallet size={16} /> Cash received</button>}
            {row.active && welcome && <a className={`${ui.btn} ${s.whatsapp}`} href={welcome} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send the link</a>}
            {row.active && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => copy(row)}>{copied === row.id ? <Check size={16} /> : <Copy size={16} />} {copied === row.id ? 'Copied' : 'Copy link'}</button>}
            {row.active && <a className={`${ui.btn} ${ui.btnSecondary}`} href={row.link} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open their page</a>}
            {row.active && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy === row.id} onClick={() => newLink(row)}><RefreshCw size={16} /> New link</button>}
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy === row.id} onClick={() => update(row, { active: !row.active }, row.active ? `${row.name} is turned off: their link no longer works.` : `${row.name} is back on.`)}>{row.active ? 'Turn off' : 'Turn on'}</button>
            {cash === 0 && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} style={{ color: 'var(--admin-danger, #b42318)' }} disabled={busy === row.id} onClick={() => remove(row)} aria-label={`Delete ${row.name}`}><Trash2 size={16} /> Delete driver</button>}
          </div>}
        </article>
      })}</div>}
  </div>
}
