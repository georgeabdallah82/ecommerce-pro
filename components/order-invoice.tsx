import { money } from '@/lib/config'
import { invoiceView, type InvoiceOrder, type InvoiceStore } from '@/lib/invoice-template'
import s from './order-invoice.module.css'

// One printable invoice page (A4), the same for staff (Admin > Orders > Invoice) and the customer
// (/invoice/<id>). Always on white paper, left to right, whatever the admin or store theme.
export default function OrderInvoice({ order, store, note = '', timezone }: { order: InvoiceOrder; store: InvoiceStore; note?: string; timezone?: string }) {
  const v = invoiceView(order)
  const date = (() => { try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone || undefined }).format(new Date(order.createdAt)) } catch { return order.createdAt.slice(0, 10) } })()
  const m = (cents: number) => money(cents, order.currency)
  const contact = [store.phone, store.email, store.website].filter(Boolean)
  return (
    <article className={s.sheet} dir="ltr" lang="en" style={{ ['--inv-brand' as string]: store.color }}>
      <header className={s.head}>
        <div className={s.brand}>
          {store.logoUrl ? <img className={s.logo} src={store.logoUrl} alt={store.name}/> : <strong className={s.brandName}>{store.name}</strong>}
          {store.address && <p>{store.address}</p>}
          {contact.length > 0 && <p>{contact.join(' · ')}</p>}
        </div>
        <div className={s.meta}>
          <h1 className={s.docTitle}>{store.title}</h1>
          <dl>
            <div><dt>Order</dt><dd>#{order.orderNumber}</dd></div>
            <div><dt>Date</dt><dd>{date}</dd></div>
            <div><dt>Status</dt><dd>{v.status}</dd></div>
          </dl>
        </div>
      </header>

      <section className={s.parties}>
        <div>
          <h2>Bill to</h2>
          <p><strong>{v.customer}</strong></p>
          {v.phone && <p>{v.phone}</p>}
          {v.email && <p className={s.wrap}>{v.email}</p>}
        </div>
        <div>
          <h2>Deliver to</h2>
          {v.address.length ? v.address.map((line, i) => <p key={i}>{line}</p>) : <p>—</p>}
          {order.shippingMethod && <p className={s.muted}>{order.shippingMethod}</p>}
        </div>
      </section>

      <table className={s.items}>
        <thead><tr><th>Item</th><th className={s.num}>Qty</th><th className={s.num}>Price</th><th className={s.num}>Total</th></tr></thead>
        <tbody>
          {order.items.map(i => <tr key={i.id}><td><strong>{i.name}</strong>{i.variant && <span className={s.muted}> · {i.variant}</span>}</td><td className={s.num}>{i.quantity}</td><td className={s.num}>{m(i.unitPrice)}</td><td className={s.num}>{m(i.totalPrice)}</td></tr>)}
        </tbody>
      </table>

      <section className={s.bottom}>
        <div className={s.payment}>
          <h2>Payment</h2>
          <p>{v.payment}</p>
          {store.notes.trim() && <><h2>Notes</h2><p className={s.pre}>{store.notes.trim()}</p></>}
          {note.trim() && <><h2>Note</h2><p className={s.pre}>{note.trim()}</p></>}
        </div>
        <div className={s.totals}>
          <div><span>Subtotal</span><span>{m(order.subtotal)}</span></div>
          {order.discountTotal > 0 && <div><span>Discount</span><span>− {m(order.discountTotal)}</span></div>}
          <div><span>Delivery</span><span>{order.shippingTotal > 0 ? m(order.shippingTotal) : 'Free'}</span></div>
          {order.taxTotal > 0 && <div><span>Tax</span><span>{m(order.taxTotal)}</span></div>}
          <div className={s.grand}><span>Total</span><span>{m(order.grandTotal)}</span></div>
          <div className={`${s.balance} ${v.balance.due ? s.due : ''}`}><span>{v.balance.label}</span>{v.balance.due && <strong>{m(order.grandTotal)}</strong>}</div>
        </div>
      </section>

      {(store.footer.trim() || store.website) && <footer className={s.foot}>{store.footer.trim() && <p className={s.pre}>{store.footer.trim()}</p>}{store.website && <p className={s.muted}>{store.website}</p>}</footer>}
    </article>
  )
}
