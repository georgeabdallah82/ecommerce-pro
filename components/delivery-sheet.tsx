'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, FileText, MapPin, MessageCircle, Phone, Printer, Truck, Users } from 'lucide-react'
import { money } from '@/lib/config'
import { internationalPhone } from '@/lib/phone'
import { addressParts, customerName, customerPhone, itemsSummary, mapsLink, orderPin, statusInfo, telLink } from '@/lib/order-flow'
import { driverRunMessage, groupByArea, toCollect, type SheetOrder } from '@/lib/delivery-sheet'
import { useConfirm } from './admin-confirm'
import s from './delivery-sheet.module.css'
import ui from './admin-ui.module.css'
import { AddressParts } from './address-parts'

const DRIVER_KEY = 'yh-driver-phone'
const CHOICE_KEY = 'yh-driver-choice'
type SheetDriver = { id: string; name: string; phone: string; link: string }

async function assignDriver(orderIds: string[], driverId: string) {
  const r = await fetch('/api/admin/drivers/assign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds, driverId }), keepalive: true })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Unable to give the orders to the driver') }
}

async function patchOrder(id: string, status: string) {
  const r = await fetch('/api/admin/orders', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Unable to update the order')
  return d
}

export default function DeliverySheet({ initial, deliveredToday, areaOrder, dayLabel, storeName, storeCountry, canManage, drivers = [] }: { initial: SheetOrder[]; deliveredToday: Array<{ id: string; orderNumber: string; paymentMethod: string; grandTotal: number; currency: string }>; areaOrder: string[]; dayLabel: string; storeName: string; storeCountry: string; canManage: boolean; drivers?: SheetDriver[] }) {
  const confirm = useConfirm()
  const [orders, setOrders] = useState(initial)
  const [done, setDone] = useState(deliveredToday)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.map(o => o.id)))
  const [driver, setDriver] = useState('')
  // The store's drivers (Admin > Orders > Drivers), or "another number" typed here.
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    try {
      setDriver(localStorage.getItem(DRIVER_KEY) || '')
      const saved = localStorage.getItem(CHOICE_KEY) || ''
      setChoice(drivers.some(d => d.id === saved) ? saved : drivers[0]?.id || '')
    } catch {}
  }, [drivers])
  const saveDriver = (value: string) => { setDriver(value); try { localStorage.setItem(DRIVER_KEY, value) } catch {} }
  const saveChoice = (value: string) => { setChoice(value); try { localStorage.setItem(CHOICE_KEY, value) } catch {} }
  const chosenDriver = drivers.find(d => d.id === choice) || null
  const driverName = (id: string | null | undefined) => drivers.find(d => d.id === id)?.name || ''

  const currency = orders[0]?.currency || done[0]?.currency || 'USD'
  const out = orders.filter(o => o.status === 'SHIPPED')
  const ready = orders.filter(o => o.status !== 'SHIPPED')
  const groups = useMemo(() => groupByArea(orders, areaOrder), [orders, areaOrder])
  const chosen = orders.filter(o => selected.has(o.id))
  const collectOut = out.reduce((sum, o) => sum + toCollect(o), 0)
  const collectedToday = done.filter(o => o.paymentMethod === 'COD').reduce((sum, o) => sum + o.grandTotal, 0)
  const driverDigits = internationalPhone(chosenDriver ? chosenDriver.phone : driver, storeCountry)
  const runText = chosen.length ? driverRunMessage(chosen, storeName, dayLabel, money) + (chosenDriver ? `\n\nYour list, tap "Delivered" there:\n${chosenDriver.link}` : '') : ''
  const runLink = chosen.length ? `https://wa.me/${driverDigits}?text=${encodeURIComponent(runText)}` : ''

  // Sending the list to one of the store's drivers also gives them these orders, so they show on
  // the driver's own page.
  function giveToDriver(list: SheetOrder[]) {
    if (!chosenDriver || !canManage || !list.length) return
    const ids = list.map(o => o.id)
    assignDriver(ids, chosenDriver.id)
      .then(() => setOrders(current => current.map(o => ids.includes(o.id) ? { ...o, driverId: chosenDriver.id } : o)))
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to give the orders to the driver'))
  }

  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  async function sendOut(order: SheetOrder) {
    setBusy(order.id); setError(''); setNotice('')
    try {
      // Confirmed orders go through "Preparing" first, like the order page's Next step button.
      if (chosenDriver && canManage) await assignDriver([order.id], chosenDriver.id)
      if (order.status === 'CONFIRMED') await patchOrder(order.id, 'PROCESSING')
      await patchOrder(order.id, 'SHIPPED')
      setOrders(current => current.map(o => o.id === order.id ? { ...o, status: 'SHIPPED', driverId: chosenDriver ? chosenDriver.id : o.driverId } : o))
      setNotice(`#${order.orderNumber} is out for delivery${chosenDriver ? ` with ${chosenDriver.name}` : ''}.`)
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
      <div className={`${s.actions} ${s.noPrint}`}>
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders/drivers"><Users size={15} /> Drivers</Link>
        {chosen.length > 0 && <a className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/orders/packing-slips?ids=${chosen.map(o => o.id).join(',')}`} target="_blank" rel="noreferrer"><FileText size={15} /> Packing slips ({chosen.length})</a>}
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => window.print()}><Printer size={15} /> Print</button>
      </div>
    </div>

    <div className={s.stats}>
      <div><strong>{out.length}</strong><span>out for delivery</span><em>{money(collectOut, currency)} to collect</em></div>
      <div><strong>{ready.length}</strong><span>ready to send</span></div>
      <div><strong>{money(collectedToday, currency)}</strong><span>collected today</span><em>{done.length} delivered</em></div>
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''} ${s.noPrint}`} role="status">{error || notice}</div>}

    {orders.length > 0 && <section className={`${ui.card} ${s.driver} ${s.noPrint}`}>
      {drivers.length > 0 && <label className={ui.fieldLabel}>Driver
        <select className={ui.select} value={choice} onChange={e => saveChoice(e.target.value)}>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="">Another number</option>
        </select>
      </label>}
      {!chosenDriver && <label className={ui.fieldLabel}>Driver's WhatsApp number
        <input className={ui.input} type="tel" inputMode="tel" dir="ltr" value={driver} onChange={e => saveDriver(e.target.value)} placeholder="e.g. 70 123 456 (optional)" />
      </label>}
      <p className={ui.muted}>{chosen.length} of {orders.length} orders ticked · {money(chosen.reduce((sum, o) => sum + toCollect(o), 0), currency)} to collect. {chosenDriver ? `The message includes ${chosenDriver.name}'s own list, where they tap "Delivered".` : driverDigits ? '' : 'Without a number, WhatsApp asks who to send it to.'}{!drivers.length && <> <Link className={ui.textLink} href="/admin/orders/drivers">Add your drivers</Link> to give each one their own delivery list.</>}</p>
      <div className={s.actions}>
        {runLink && <a className={`${ui.btn} ${s.whatsapp}`} href={runLink} target="_blank" rel="noreferrer" onClick={() => giveToDriver(chosen)}><MessageCircle size={16} /> Send {chosen.length} to {chosenDriver ? chosenDriver.name : 'the driver'}</a>}
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
                {driverName(order.driverId) && <span className={ui.statusPill}><Truck size={12} /> {driverName(order.driverId)}</span>}
                <strong className={s.collect}>{collect ? `Collect ${money(collect, order.currency)}` : 'Paid'}</strong>
              </div>
              <div className={s.customer}>{customerName(order)}{customerPhone(order) ? <> · <span dir="ltr">{customerPhone(order)}</span></> : null}</div>
              <div className={s.address}><AddressParts lines={addressParts(order)} empty="No address" /></div>
              <div className={s.items}>{itemsSummary(order)}</div>
              <div className={`${s.actions} ${s.noPrint}`}>
                {call && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={call}><Phone size={14} /> Call</a>}
                {map && <a className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} href={map} target="_blank" rel="noreferrer"><MapPin size={14} /> {orderPin(order) ? 'Exact spot' : 'Map'}</a>}
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
