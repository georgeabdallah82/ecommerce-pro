import { money } from '@/lib/config'
import { dateLocale, translator, type Lang, type T } from '@/lib/i18n'
import { invoiceView, type InvoiceOrder, type InvoiceStore } from '@/lib/invoice-template'
import s from './order-invoice.module.css'

const english = translator('en')

// One printable invoice page (A4), the same for staff (Admin > Orders > Invoice) and the customer
// (/invoice/<id>). Always on white paper, whatever the admin or store theme. Staff read it in
// English; the customer's copy is in the language of the store they shop in (t and lang), right to
// left in Arabic. The store's own texts (title, notes, thank-you line) are shown as typed, or in
// the customer's language while they are still the defaults (lib/invoice-template.ts).
export default function OrderInvoice({ order, store, note = '', timezone, t, lang = 'en' }: { order: InvoiceOrder; store: InvoiceStore; note?: string; timezone?: string; t?: T; lang?: Lang }) {
  const tr = t || english
  const v = invoiceView(order, t)
  const date = (() => { try { return new Intl.DateTimeFormat(lang === 'ar' ? dateLocale(lang) : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone || undefined }).format(new Date(order.createdAt)) } catch { return order.createdAt.slice(0, 10) } })()
  // Amounts, phone numbers and emails read left to right inside an Arabic invoice too. Typed texts (names, addresses,
  // notes) keep their own direction in <bdi>, and the line keeps the invoice's alignment.
  const m = (cents: number) => <span dir="ltr">{money(cents, order.currency)}</span>
  const contact = [store.phone, store.email, store.website].filter(Boolean)
  return (
    <article className={s.sheet} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} style={{ ['--inv-brand' as string]: store.color }}>
      <header className={s.head}>
        <div className={s.brand}>
          {store.logoUrl ? <img className={s.logo} src={store.logoUrl} alt={store.name}/> : <strong className={s.brandName}><bdi>{store.name}</bdi></strong>}
          {store.address && <p><bdi>{store.address}</bdi></p>}
          {contact.length > 0 && <p><span dir="ltr">{contact.join(' · ')}</span></p>}
        </div>
        <div className={s.meta}>
          <h1 className={s.docTitle}>{tr(store.title)}</h1>
          <dl>
            <div><dt>{tr('Order')}</dt><dd>#{order.orderNumber}</dd></div>
            <div><dt>{tr('Date')}</dt><dd>{date}</dd></div>
            <div><dt>{tr('Status')}</dt><dd>{v.status}</dd></div>
          </dl>
        </div>
      </header>

      <section className={s.parties}>
        <div>
          <h2>{tr('Bill to')}</h2>
          <p><strong><bdi>{v.customer}</bdi></strong></p>
          {v.phone && <p><span dir="ltr">{v.phone}</span></p>}
          {v.email && <p className={s.wrap}><span dir="ltr">{v.email}</span></p>}
        </div>
        <div>
          <h2>{tr('Deliver to')}</h2>
          {v.address.length ? v.address.map((line, i) => <p key={i}><bdi>{line}</bdi></p>) : <p>—</p>}
          {order.shippingMethod && <p className={s.muted}><bdi>{order.shippingMethod}</bdi></p>}
        </div>
      </section>

      <table className={s.items}>
        <thead><tr><th>{tr('Item')}</th><th className={s.num}>{tr('Qty')}</th><th className={s.num}>{tr('Price')}</th><th className={s.num}>{tr('Total')}</th></tr></thead>
        <tbody>
          {order.items.map(i => <tr key={i.id}><td><strong><bdi>{i.name}</bdi></strong>{i.variant && <span className={s.muted}> · <bdi>{i.variant}</bdi></span>}</td><td className={s.num}>{i.quantity}</td><td className={s.num}>{m(i.unitPrice)}</td><td className={s.num}>{m(i.totalPrice)}</td></tr>)}
        </tbody>
      </table>

      <section className={s.bottom}>
        <div className={s.payment}>
          <h2>{tr('Payment')}</h2>
          <p>{v.payment}</p>
          {store.notes.trim() && <><h2>{tr('Notes')}</h2><p className={s.pre}><bdi>{store.notes.trim()}</bdi></p></>}
          {note.trim() && <><h2>{tr('Note')}</h2><p className={s.pre}><bdi>{note.trim()}</bdi></p></>}
        </div>
        <div className={s.totals}>
          <div><span>{tr('Subtotal')}</span>{m(order.subtotal)}</div>
          {order.discountTotal > 0 && <div><span>{tr('Discount')}</span><span dir="ltr">− {money(order.discountTotal, order.currency)}</span></div>}
          <div><span>{tr('Delivery')}</span>{order.shippingTotal > 0 ? m(order.shippingTotal) : <span>{tr('Free')}</span>}</div>
          {order.taxTotal > 0 && <div><span>{tr('Tax')}</span>{m(order.taxTotal)}</div>}
          <div className={s.grand}><span>{tr('Total')}</span>{m(order.grandTotal)}</div>
          <div className={`${s.balance} ${v.balance.due ? s.due : ''}`}><span>{v.balance.label}</span>{v.balance.due && <strong>{m(order.grandTotal)}</strong>}</div>
        </div>
      </section>

      {(store.footer.trim() || store.website) && <footer className={s.foot}>{store.footer.trim() && <p className={s.pre}><bdi>{tr(store.footer.trim())}</bdi></p>}{store.website && <p className={s.muted}><span dir="ltr">{store.website}</span></p>}</footer>}
    </article>
  )
}
