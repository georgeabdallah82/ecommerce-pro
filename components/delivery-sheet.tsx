'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, MapPin, MessageCircle, Phone, Printer, Truck } from 'lucide-react'
import { money } from '@/lib/config'
import { internationalPhone } from '@/lib/phone'
import { addressLines, customerName, customerPhone, itemsSummary, mapsLink, statusInfo, telLink } from '@/lib/order-flow'
import { driverRunMessage, groupByArea, toCollect, type SheetOrder } from '@/lib/delivery-sheet'
import { useConfirm } from './admin-confirm'
import s from './delivery-sheet.module.css'
import ui from './admin-ui.module.css'

const DRIVER_KEY = 'yh-driver-phone'

async function patchOrder(id: string, status: string) {
  const r = await fetch('/api/admin/orders', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Unable to update the order')
  return d
}

export default function DeliverySheet({ initial, deliveredToday, areaOrder, dayLabel, storeName, storeCountry, canManage }: { initial: SheetOrder[]; deliveredToday: Array<{ id: string; orderNumber: string; paymentMethod: string; grandTotal: number; currency: string }>; areaOrder: string[]; dayLabel: string; storeName: string; storeCountry: string; canManage: boolean }) {
  const confirm = useConfirm()
  const [orders, setOrders] = useState(initial)
  const [done, setDone] = useState(deliveredToday)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.map(o => o.id)))
  const [driver, setDriver] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { try { setDriver(localStorage.getItem(DRIVER_KEY) || '') } catch {} }, [])
  const saveDriver = (value: string) => { setDriver(value); try { localStorage.setItem(DRIVER_KEY, value) } catch {} }

  const currency = orders[0]?.currency || done[0]?.currency || 'USD'
  const out = orders.filter(o => o.status === 'SHIPPED')
  const ready = orders.filter(o => o.status !== 'SHIPPED')
  const groups = useMemo(() => groupByArea(orders, areaOrder), [orders, areaOrder])
  const chosen = orders.filter(o => selected.has(o.id))
  const collectOut = out.reduce((sum, o) => sum + toCollect(o), 0)
  const collectedToday = done.filter(o => o.paymentMethod === 'COD').reduce((sum, o) => sum + o.grandTotal, 0)
  const driverDigits = internationalPhone(driver, storeCountry)
  const runLink = chosen.length ? `https://wa.me/${driverDigits}?text=${encodeURIComponent(driverRunMessage(chosen, storeName, dayLabel, money))}` : ''

  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  async function sendOut(order: SheetOrder) {
    setBusy(order.id); setError(''); setNotice('')
    try {
      // Confirmed orders go through "Preparing" first, like the order page's Next step button.
      if (order.status === 'CONFIRMED') await patchOrder(order.id, 'PROCESSING')
      await patchOrder(order.id, 'SHIPPED')
      setOrders(current => current.map(o => o.id === order.id ? { ...o, status: 'SHIPPED' } : o))
      setNotice(`#${order.orderNumber} is out for delivery.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update the order') }
    finally { setBusy('') }
  }

  async function sendAllOut() {
    const list = chosen.filter(o => o.status !== 'SHIPPED')
    if (!list.length) return
    const ok = await confirm({ title: `Mark ${list.length} order${list.length === 1 ? '' : 's'} as out for delivery?`, message: 'Do this when the driver has the parcels. Stock is taken off for these orders.', confirmLabel: 'Out for delivery', tone: 'default' })
    if (!ok) return
    for (const order of list) await sendOut(order)
    setNotice(`${list.length} order${list.length === 1 ? ' is' : 's are'} out for delivery.`)
  }

  async function delivered(order: SheetOrder) {
    const collect = toCollect(order)
    const ok = await confirm({ title: `Mark #${order.orderNumber} as delivered?`, message: collect ? `Only once the customer has the parcel and the driver collected ${money(collect, order.currency)}. The order is then marked as paid.` : 'Only once the customer has the parcel.', confirmLabel: collect ? `Delivered · ${money(collect, order.currency)} collected` : 'Delivered', tone: 'default' })
    if (!ok) return
    setBusy(order.id); setError(''); setNotice('')
    try {
      await patchOrder(order.id, 'DELIVERED')
      setOrders(current => current.filter(o => o.id !== order.id))
      setDone(current => [...current, { id: order.id, orderNumber: order.orderNumber, paymentMethod: String(order.paymentMethod || ''), grandTotal: order.grandTotal, currency: order.currency }])
      setNotice(`#${order.orderNumber} delivered.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update the order') }
    finally { setBusy('') }
  }

  return <div className={s.page}>
    <Link className={`${ui.textLink} ${s.noPrint}`} href="/admin/orders"><ArrowLeft size={15} /> Orders</Link>
    <div className={s.head}>
      <div>
        <h1 className={s.title}>Delivery sheet</h1>
        <p className={s.subtitle}>{dayLabel} · orders ready to go and out for delivery, by area.</p>
      </div>
      <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${s.noPrint}`} onClick={() => window.print()}><Printer size={15} /> Print</button>
    </div>

    <div className={s.stats}>
      <div><strong>{out.length}</strong><span>out for delivery</span><em>{money(collectOut, currency)} to collect</em></div>
      <div><strong>{ready.length}</strong><span>ready to send</span></div>
      <div><strong>{money(collectedToday, currency)}</strong><span>collected today</span><em>{done.length} delivered</em></div>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''} ${s.noPrint}`} role="status">{error || notice}</div>}

    {orders.length > 0 && <section className={`${ui.card} ${s.driver} ${s.noPrint}`}>
      <label className={ui.fieldLabel}>Driver's WhatsApp number
        <input className={ui.input} type="tel" inputMode="tel" dir="ltr" value={driver} onChange={e => saveDriver(e.target.value)} placeholder="e.g. 70 123 456 (optional)" />
      </label>
      <p className={ui.muted}>{chosen.length} of {orders.length} orders ticked · {money(chosen.reduce((sum, o) => sum + toCollect(o), 0), currency)} to collect. {driverDigits ? '' : 'Without a number, WhatsApp asks who to send it to.'}</p>
      <div className={s.actions}>
        {runLink && <a className={`${ui.btn} ${s.whatsapp}`} href={runLink} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send {chosen.length} to the driver</a>}
        {canManage && chosen.some(o => o.status !== 'SHIPPED') && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={!!busy} onClick={sendAllOut}><Truck size={15} /> Mark ticked as out for delivery</button>}
      </div>
    </section>}

    {!orders.length && <div className={`${ui.card} ${ui.empty}`}><Truck size={28} /><h3>Nothing to deliver</h3><p className={ui.muted}>Confirmed orders show up here, ready for the driver.</p></div>}

    {groups.map(group => {
      const groupCollect = group.orders.reduce((sum, o) => sum + toCollect(o), 0)
      return <section key={group.area} className={s.group}>
        <h2 className={s.area}><MapPin size={16} /> {group.area} <span>{group.orders.length} order{group.orders.length === 1 ? '' : 's'}{groupCollect ? ` · collect ${money(groupCollect, currency)}` : ''}</span></h2>
        {group.orders.map(order => {
          const collect = toCollect(order)
          const call = telLink(order, storeCountry)
          const map = mapsLink(order)
          const info = statusInfo(order.status)
          return <article key={order.id} className={`${ui.card} ${s.order}`}>
            <label className={`${s.tick} ${s.noPrint}`}><input type="checkbox" checked={selected.has(order.id)} onChange={() => toggle(order.id)} aria-label={`Include #${order.orderNumber} in the driver's list`} /></label>
            <div className={s.body}>
              <div className={s.line1}>
                <Link href={`/admin/orders/${order.id}`} className={s.number}>#{order.orderNumber}</Link>
                <span className={`${ui.statusPill} ${order.status === 'SHIPPED' ? ui.statusPillWarning : ''}`}>{info.label}</span>
                <strong className={s.collect}>{collect ? `Collect ${money(collect, order.currency)}` : 'Paid'}</strong>
              </div>
              <div className={s.customer}>{customerName(order)}{customerPhone(order) ? <> · <span dir="ltr">{customerPhone(order)}</span></> : null}</div>
              <div className={s.address}>{addressLines(order).join(', ') || 'No address'}</div>
              <div className={s.items}>{itemsSummary(order)}</div>
              <div className={`${s.actions} ${s.noPrint}`}>
                {call && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={call}><Phone size={14} /> Call</a>}
                {map && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={map} target="_blank" rel="noreferrer"><MapPin size={14} /> Map</a>}
                {canManage && order.status !== 'SHIPPED' && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} disabled={busy === order.id} onClick={() => sendOut(order)}><Truck size={14} /> Out for delivery</button>}
                {canManage && order.status === 'SHIPPED' && <button type="button" className={`${ui.btn} ${ui.btnSmall}`} disabled={busy === order.id} onClick={() => delivered(order)}><Check size={14} /> {collect ? `Delivered · ${money(collect, order.currency)} collected` : 'Delivered'}</button>}
              </div>
            </div>
          </article>
        })}
      </section>
    })}
  </div>
}
