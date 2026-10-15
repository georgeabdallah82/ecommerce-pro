import { createHash } from 'node:crypto'
import { internationalPhone } from '@/lib/phone'
import Link from 'next/link'
import { getT } from '@/lib/i18n-server'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { PurchaseTracker } from '@/components/purchase-tracker'
import { StoreFooter } from '@/components/store-footer'
import { PaymentInstructions } from '@/components/payment-instructions'
import { canViewOrder, orderViewToken } from '@/lib/order-access'

// Advanced matching for the ad pixels: SHA-256 of the buyer's email and phone, normalised the
// way Meta and TikTok expect (lower-case email; phone as digits with the country code). Only the
// hashes reach the browser.
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
async function hashedCustomer(email: string | null, phone: string | null) {
  const em = (email || '').trim().toLowerCase()
  const country = phone ? (await db.setting.findUnique({ where: { key: 'store.country' } }).catch(() => null))?.value : ''
  const ph = internationalPhone(phone, country)
  return { ...(em.includes('@') ? { em: sha256(em) } : {}), ...(ph ? { ph: sha256(ph) } : {}) }
}

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string; email?: string; payment?: string; t?: string }> }) {
  const { order, email, payment, t } = await searchParams
  if (!order) notFound()
  const tr = await getT()
  const user = await getCurrentUser()

  const record = await db.order.findUnique({
    where: { orderNumber: order },
    select: { orderNumber: true, userId: true, grandTotal: true, currency: true, status: true, paymentStatus: true, paymentMethod: true, email: true, phone: true, items: { select: { productId: true, name: true, quantity: true, unitPrice: true } } },
  })
  // An order number alone shows nothing: details need the owner's session, the view code in the
  // link checkout gave, or the order's email (lib/order-access.ts). Without one the page reads the
  // same whether or not the order exists, so it can't be used to probe order numbers either.
  if (!record || !canViewOrder(record, { userId: user?.id, token: t, email })) {
    return <><main className="section"><div className="container"><div className="card successCard">
      <span className="pill">{tr('ORDER')}</span>
      <h1 className="h2">{tr('Thank you for shopping with us.')}</h1>
      <p className="body muted">{user ? tr("If you just placed an order, your confirmation is on its way to your email. To see an order's details, look it up with the email you used at checkout or open your account.") : tr("If you just placed an order, your confirmation is on its way to your email. To see an order's details, look it up with the email you used at checkout.")}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href="/orders/lookup">{tr('Look up an order')}</Link>
        {user ? <Link className="btn secondary" href="/account">{tr('View account')}</Link> : <Link className="btn secondary" href="/shop">{tr('Continue shopping')}</Link>}
      </div>
    </div></div></main><StoreFooter /></>
  }

  const isOwner = !!user?.id && record.userId === user.id
  const viewOrderHref = isOwner
    ? `/account/orders/${encodeURIComponent(order)}`
    : `/account/orders/${encodeURIComponent(order)}?t=${encodeURIComponent(orderViewToken(record.orderNumber))}`

  // The card gateway sends customers here for every outcome (?payment=paid|failed|pending).
  // A failed or cancelled order must not read as "confirmed" or be reported as a sale.
  const failed = payment === 'failed' || record.paymentStatus === 'FAILED' || record.status === 'CANCELLED'
  const processing = !failed && record.paymentMethod === 'CARD' && record.paymentStatus !== 'PAID'

  if (failed) {
    return <><main className="section"><div className="container"><div className="card successCard">
      <span className="pill">{tr('PAYMENT NOT COMPLETED')}</span>
      <h1 className="h2">{tr("Your payment didn't go through.")}</h1>
      <p className="body muted">{tr("You haven't been charged for order #{order}. You can try again with another card or choose cash on delivery.", { order })}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href="/cart">{tr('Back to cart')}</Link>
        <Link className="btn secondary" href="/shop">{tr('Continue shopping')}</Link>
      </div>
    </div></div></main><StoreFooter /></>
  }

  return <><main className="section"><div className="container"><div className="card successCard">
    <span className="pill">{processing ? tr('PAYMENT PROCESSING') : tr('ORDER CONFIRMED')}</span>
    <h1 className="h2">{tr('Thank you for your order.')}</h1>
    {processing && <p className="body muted">{tr("We're waiting for your bank to confirm the payment. You'll get an email as soon as it does.")}</p>}
    <p className="body muted">{tr('Your order number is')} <strong dir="ltr">#{order}</strong>. {tr('Keep it for your records.')}</p>
    {!processing && <PaymentInstructions method={record.paymentMethod} status={record.paymentStatus} amount={money(record.grandTotal, record.currency)} orderNumber={record.orderNumber} />}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Link className="btn" href="/shop">{tr('Continue shopping')}</Link>
      <Link className="btn secondary" href={viewOrderHref}>{tr('View order')}</Link>
      {user ? <Link className="btn secondary" href="/account">{tr('View account')}</Link> : <Link className="btn secondary" href="/account/register">{tr('Create an account to track future orders')}</Link>}
    </div>
  </div></div>
  {!processing && <PurchaseTracker
    orderNumber={record.orderNumber}
    value={record.grandTotal / 100}
    currency={record.currency}
    items={record.items.map(i => ({ id: String(i.productId), name: i.name, price: i.unitPrice / 100, quantity: i.quantity }))}
    customer={await hashedCustomer(record.email, record.phone)}
  />}
  </main><StoreFooter /></>
}
