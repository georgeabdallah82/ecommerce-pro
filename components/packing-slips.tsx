'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from '@/components/admin-link'
import { ArrowLeft, Gift, Printer } from 'lucide-react'
import { formatAdminDate } from '@/lib/admin-datetime'
import { addressLines, customerName, customerPhone, shippingAddress } from '@/lib/order-flow'
import s from './packing-slips.module.css'

export type SlipOrder = {
  id: string; orderNumber: string; createdAt: string; phone: string; email: string; userName: string
  shippingAddressJson: string; shippingMethod: string; isGift: boolean; giftMessage: string
  items: Array<{ id: string; name: string; variant: string; quantity: number }>
}
type SlipStore = { name: string; logoUrl: string; color: string; website: string; phone: string; footer: string }

function Slip({ order, store, timezone }: { order: SlipOrder; store: SlipStore; timezone: string }) {
  const flow = { ...order, user: order.userName ? { name: order.userName } : null }
  const a = shippingAddress(order.shippingAddressJson)
  const units = order.items.reduce((sum, i) => sum + i.quantity, 0)
  return <article className={s.slip} style={{ ['--slip-color' as string]: store.color }}>
    <header className={s.top}>
      {store.logoUrl ? <img className={s.logo} src={store.logoUrl} alt={store.name} /> : <strong className={s.brand}>{store.name}</strong>}
      <div className={s.meta}><span className={s.kind}>Packing slip</span><strong>#{order.orderNumber}</strong><span>{formatAdminDate(order.createdAt, timezone)}</span></div>
    </header>
    <section className={s.to}>
      <span className={s.label}>{order.isGift ? 'Deliver to' : 'Ship to'}</span>
      <strong>{customerName(flow)}</strong>
      {customerPhone(flow) && <span dir="ltr">{customerPhone(flow)}</span>}
      {addressLines(flow).map((line, i) => <span key={i} dir="auto">{line}</span>)}
      {a.notes && <span className={s.notes} dir="auto">Note: {String(a.notes)}</span>}
    </section>
    {order.isGift && <section className={s.gift}>
      <Gift size={22} />
      <div><span className={s.label}>A gift for you</span>{order.giftMessage ? <p dir="auto">{order.giftMessage}</p> : <p>Enjoy your gift!</p>}</div>
    </section>}
    <table className={s.items}>
      <thead><tr><th className={s.qty}>Qty</th><th>Item</th><th className={s.check}>Packed</th></tr></thead>
      <tbody>{order.items.map(item => <tr key={item.id}><td className={s.qty}>{item.quantity}</td><td>{item.name}{item.variant && <span className={s.variant}> · {item.variant}</span>}</td><td className={s.check}><span className={s.box} /></td></tr>)}</tbody>
    </table>
    <p className={s.count}>{units} item{units === 1 ? '' : 's'} in this parcel</p>
    <footer className={s.foot}>
      <p>{store.footer || 'Thank you for shopping with us!'}</p>
      <p className={s.contact}>{[store.website, store.phone].filter(Boolean).join(' · ')}</p>
    </footer>
  </article>
}

// Packing slips for one or more orders (app/admin/orders/packing-slips). Printing works like the
// invoice: a copy of the slips is put directly in <body> and everything else is hidden.
export default function PackingSlips({ orders, store, timezone }: { orders: SlipOrder[]; store: SlipStore; timezone: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement('div')
    el.className = s.printHost
    document.body.appendChild(el)
    setHost(el)
    return () => { el.remove() }
  }, [])
  const slips = orders.map(order => <Slip key={order.id} order={order} store={store} timezone={timezone} />)
  return <div className={s.page}>
    <div className={s.toolbar}>
      <Link className={s.back} href={orders.length === 1 ? `/admin/orders/${orders[0].id}` : '/admin/orders/deliveries'}><ArrowLeft size={15} /> {orders.length === 1 ? `Order #${orders[0].orderNumber}` : 'Delivery sheet'}</Link>
      <div>
        <h1>Packing slip{orders.length === 1 ? '' : `s (${orders.length})`}</h1>
        <p>Goes inside the parcel: items and delivery details, no prices. Gift orders show the customer&apos;s message.</p>
      </div>
      <button type="button" className={s.print} onClick={() => window.print()}><Printer size={17} /> Print</button>
    </div>
    <div className={s.screen}>{slips}</div>
    {host && createPortal(<div className={s.printOnly}>{slips}</div>, host)}
  </div>
}
