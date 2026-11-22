import Link from 'next/link'
import { BellOff, Link2Off, PackageOpen, ShoppingBasket } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import RefillButton from '@/components/refill-button'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { cartLinesFor } from '@/lib/order-again'
import { isValidRefillToken } from '@/lib/refill-reminders'
import { getStoreCurrency } from '@/lib/store-currency'
import { getT } from '@/lib/i18n-server'
// The order confirmation's cards (app/order/success), like the store's other pages reached from a link it sends.
import s from '@/app/order/success/success.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Running low?', robots: { index: false, follow: false } }

// Linked from "Running low?" reminders (lib/refill-reminders.ts): the products the customer may need again, at today's
// prices, back in the cart in one tap. "Stop these reminders" asks first (mail scanners open every link in an email
// and must not stop anything), then posts to /api/refill/stop.
export default async function Refill({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orderNumber: raw } = await params
  const query = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
  const orderNumber = raw.slice(0, 60)
  const token = one(query.t).slice(0, 100)
  const valid = isValidRefillToken(orderNumber, token)
  const tr = await getT()
  const here = `/refill/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`
  const back = (primary: boolean) => <Link className={primary ? `${s.btn} ${s.btnPrimary}` : s.btn} href="/">{tr('Back to the store')}</Link>

  let body: React.ReactNode
  if (!valid) {
    body = <section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${s.tickWarn}`} aria-hidden="true"><Link2Off size={32} /></span>
      <h1 className={s.title}>{tr('This link has expired or is not valid')}</h1>
      <div className="linkActions">{back(true)}</div>
    </section>
  } else if (one(query.stopped) === '1') {
    body = <section className={`${s.card} ${s.hero}`}>
      <span className={s.tick} aria-hidden="true"><BellOff size={32} /></span>
      <h1 className={s.title}>{tr("You won't get these reminders again")}</h1>
      <p className={s.lead}>{tr('Emails and messages about your orders still arrive as usual.')}</p>
      <div className="linkActions">{back(true)}</div>
    </section>
  } else if (one(query.stop) === '1') {
    body = <section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} linkBadge`} aria-hidden="true"><BellOff size={32} /></span>
      <h1 className={s.title}>{tr('Stop "Running low?" reminders?')}</h1>
      <p className={s.lead}>{tr('We remind you when something you bought may be running out. Emails and messages about your orders are not affected.')}</p>
      <div className={`${s.actions} linkActions`}>
        <form method="post" action={`/api/refill/stop?o=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(token)}`}>
          <button className={`${s.btn} ${s.btnPrimary} linkSubmit`} type="submit">{tr('Yes, stop these reminders')}</button>
        </form>
        {back(false)}
      </div>
    </section>
  } else {
    const order = await db.order.findUnique({ where: { orderNumber }, select: { items: { select: { productId: true, variantId: true, quantity: true, unitPrice: true, name: true, product: { select: { refillDays: true } } } } } })
    // The products with a reminder (the ones it was about); an order without any shows all of its products.
    const all = order?.items || []
    const withReminder = all.filter(i => i.product?.refillDays)
    const lines = await cartLinesFor((withReminder.length ? withReminder : all).map(({ product: _product, ...line }) => line))
    const currency = await getStoreCurrency()
    body = lines.length ? <section className={`${s.card} ${s.hero}`}>
      <span className={s.tick} aria-hidden="true"><ShoppingBasket size={32} /></span>
      <h1 className={s.title}>{tr('Running low?')}</h1>
      <p className={s.lead}>{tr("Put these back in your cart in one tap, at today's prices.")}</p>
      <ul className={s.items} style={{ width: '100%' }}>{lines.map(line => <li key={`${line.productId}:${line.variantId || ''}`}><span>{line.quantity} × {line.name}</span><strong>{money(line.price * line.quantity, currency)}</strong></li>)}</ul>
      <div className={`${s.actions} linkActions`} style={{ width: '100%' }}>
        <RefillButton className={`${s.btn} ${s.btnPrimary}`} items={lines} />
        {back(false)}
      </div>
      <p className={s.small}><Link href={`${here}&stop=1`}>{tr('Stop these reminders')}</Link></p>
    </section> : <section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${s.tickWarn}`} aria-hidden="true"><PackageOpen size={32} /></span>
      <h1 className={s.title}>{tr("These products can't be ordered right now")}</h1>
      <p className={s.lead}>{tr('They are sold out or no longer for sale. Have a look at what else we have.')}</p>
      <div className="linkActions">{back(true)}</div>
    </section>
  }
  return <>
    <main className={s.page}><div className={s.wrap}>{body}</div></main>
    <StoreFooter />
  </>
}
