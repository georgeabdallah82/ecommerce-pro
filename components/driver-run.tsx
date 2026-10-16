'use client'

import { useState } from 'react'
import { AlertTriangle, Check, MapPin, MessageCircle, Package, Phone, Wallet } from 'lucide-react'
import { money } from '@/lib/config'
import { internationalPhone } from '@/lib/phone'
import { addressLines, customerName, customerPhone, mapsLink, shippingAddress, type FlowOrder } from '@/lib/order-flow'
import { toCollect } from '@/lib/delivery-sheet'
import { PROBLEM_REASONS, cashToHandOver } from '@/lib/drivers-shared'
import s from './driver-run.module.css'

type RunOrder = FlowOrder & { id: string; cashCollected: number | null; cashSettledAt: string | null; updatedAt: string }

// The driver's own page (app/driver/[token]). Big buttons, one order per card, works on any
// phone. "Delivered" tells the store the parcel arrived and the cash was collected.
export default function DriverRun({ token, driverName, storeName, storeCountry, storePhone, initial }: { token: string; driverName: string; storeName: string; storeCountry: string; storePhone: string; initial: RunOrder[] }) {
  const [orders, setOrders] = useState(initial)
  const [busy, setBusy] = useState('')
  const [confirming, setConfirming] = useState('')
  const [problemFor, setProblemFor] = useState('')
  const [reason, setReason] = useState<string>(PROBLEM_REASONS[0].value)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const toDeliver = orders.filter(o => o.status === 'SHIPPED')
  const preparing = orders.filter(o => o.status === 'CONFIRMED' || o.status === 'PROCESSING')
  const delivered = orders.filter(o => o.status === 'DELIVERED')
  const currency = orders[0]?.currency || 'USD'
  const holding = cashToHandOver(delivered)
  const toCollectNow = toDeliver.reduce((sum, o) => sum + toCollect(o), 0)

  async function send(order: RunOrder, action: 'delivered' | 'problem') {
    setBusy(order.id); setError(''); setNotice('')
    try {
      const r = await fetch(`/api/driver/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, orderId: order.id, reason, note }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.')
      if (action === 'delivered') {
        setOrders(current => current.map(o => o.id === order.id ? { ...o, status: 'DELIVERED', cashCollected: d.cash || null, cashSettledAt: null, paymentStatus: d.cash ? 'PAID' : o.paymentStatus } : o))
        setNotice(d.cash ? `#${order.orderNumber} delivered. You collected ${money(d.cash, order.currency)}.` : `#${order.orderNumber} delivered.`)
      } else {
        setNotice(`Thanks, the store was told about #${order.orderNumber}.`)
        setProblemFor(''); setNote('')
      }
      setConfirming('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.') }
    finally { setBusy('') }
  }

  return <main className={s.page}>
    <header className={s.head}>
      <span className={s.store}>{storeName}</span>
      <h1>Hi {driverName.split(/\s+/)[0]}!</h1>
      <p>{toDeliver.length ? `${toDeliver.length} order${toDeliver.length === 1 ? '' : 's'} to deliver${toCollectNow ? `, ${money(toCollectNow, currency)} to collect` : ''}.` : 'Nothing to deliver right now.'}</p>
    </header>

    {holding.amount > 0 && <section className={s.cash}>
      <Wallet size={22} />
      <div><strong>{money(holding.amount, currency)} with you</strong><span>Cash from {holding.orders} deliver{holding.orders === 1 ? 'y' : 'ies'}. Hand it to the store.</span></div>
    </section>}

    {(error || notice) && <p className={error ? s.error : s.notice} role={error ? 'alert' : 'status'}>{error || notice}</p>}

    {toDeliver.map(order => {
      const collect = toCollect(order)
      const digits = internationalPhone(customerPhone(order), storeCountry)
      const map = mapsLink(order)
      const a = shippingAddress(order.shippingAddressJson)
      return <article key={order.id} className={s.card}>
        <div className={s.top}>
          <strong className={s.number}>#{order.orderNumber}</strong>
          <span className={collect ? s.collect : s.paid}>{collect ? `Collect ${money(collect, order.currency)}` : 'Paid: collect nothing'}</span>
        </div>
        <div className={s.name}>{customerName(order)}</div>
        <div className={s.address}>{addressLines(order).join(', ') || 'No address: call the customer'}</div>
        {a.notes && <div className={s.note}>Note: {String(a.notes)}</div>}
        <ul className={s.items}>{(order.items || []).map((item, i) => <li key={i}><Package size={14} /> {item.quantity} × {item.name}{item.variant?.name && item.variant.name !== 'Default Title' ? ` (${item.variant.name})` : ''}</li>)}</ul>
        <div className={s.contact}>
          {digits && <a className={s.btn} href={`tel:+${digits}`}><Phone size={18} /> Call</a>}
          {digits && <a className={`${s.btn} ${s.wa}`} href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>}
          {map && <a className={s.btn} href={map} target="_blank" rel="noreferrer"><MapPin size={18} /> Map</a>}
        </div>
        {confirming === order.id
          ? <div className={s.confirm}>
            <p>{collect ? `The customer has the parcel and you collected ${money(collect, order.currency)}?` : 'The customer has the parcel?'}</p>
            <div className={s.row}>
              <button type="button" className={`${s.big} ${s.ok}`} disabled={busy === order.id} onClick={() => send(order, 'delivered')}><Check size={20} /> {busy === order.id ? 'Saving…' : 'Yes, delivered'}</button>
              <button type="button" className={s.btn} onClick={() => setConfirming('')}>Back</button>
            </div>
          </div>
          : problemFor === order.id
            ? <div className={s.confirm}>
              <label>What happened?
                <select value={reason} onChange={e => setReason(e.target.value)}>{PROBLEM_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
              </label>
              <label>Note (optional)<input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="e.g. Call again after 6 pm" /></label>
              <div className={s.row}>
                <button type="button" className={`${s.big} ${s.warn}`} disabled={busy === order.id} onClick={() => send(order, 'problem')}>{busy === order.id ? 'Sending…' : 'Tell the store'}</button>
                <button type="button" className={s.btn} onClick={() => setProblemFor('')}>Back</button>
              </div>
            </div>
            : <div className={s.row}>
              <button type="button" className={`${s.big} ${s.ok}`} onClick={() => { setConfirming(order.id); setProblemFor('') }}><Check size={20} /> Delivered</button>
              <button type="button" className={s.btn} onClick={() => { setProblemFor(order.id); setConfirming(''); setReason(PROBLEM_REASONS[0].value); setNote('') }}><AlertTriangle size={18} /> Problem</button>
            </div>}
      </article>
    })}

    {preparing.length > 0 && <section className={s.section}>
      <h2>Getting ready ({preparing.length})</h2>
      <p className={s.muted}>The store is preparing these for you: {preparing.map(o => `#${o.orderNumber}`).join(', ')}.</p>
    </section>}

    {delivered.length > 0 && <section className={s.section}>
      <h2>Delivered ({delivered.length})</h2>
      {delivered.map(o => <div key={o.id} className={s.done}><span>#{o.orderNumber} · {customerName(o)}</span><span>{o.cashCollected ? `${money(o.cashCollected, o.currency)}${o.cashSettledAt ? ' handed over' : ''}` : 'paid'}</span></div>)}
    </section>}

    {storePhone && <p className={s.footer}>Questions? <a href={`tel:${storePhone.replace(/[^\d+]/g, '')}`}>Call the store</a></p>}
  </main>
}
