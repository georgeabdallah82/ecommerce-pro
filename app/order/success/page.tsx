import { createHash } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle, CheckCircle2, Clock, MessageCircle, PackageCheck, PhoneCall, Wallet } from 'lucide-react'
import { internationalPhone } from '@/lib/phone'
import { getT } from '@/lib/i18n-server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { PurchaseTracker } from '@/components/purchase-tracker'
import { StoreFooter } from '@/components/store-footer'
import { PaymentInstructions } from '@/components/payment-instructions'
import { canViewOrder, orderViewToken } from '@/lib/order-access'
import { getContactInfo } from '@/lib/store-contact'
import { getStoreIdentity } from '@/lib/store-identity'
import { getThemeState } from '@/lib/theme'
import { whatsappDigits } from '@/lib/links'
import { customerOrderMessage, whatsappMessageLink } from '@/lib/order-whatsapp'
import { inviteCardFor } from '@/lib/invites'
import InviteShare from '@/components/invite-share'
import PaymentProofBox from '@/components/payment-proof-box'
import { proofState } from '@/lib/payment-proof'
import s from './success.module.css'

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

const address = (raw: string | null | undefined): Record<string, string> => { try { const a = JSON.parse(raw || '{}'); return a && typeof a === 'object' ? a : {} } catch { return {} } }

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string; email?: string; payment?: string; t?: string }> }) {
  const { order, email, payment, t } = await searchParams
  if (!order) notFound()
  const tr = await getT()
  const user = await getCurrentUser()

  const record = await db.order.findUnique({
    where: { orderNumber: order },
    select: { orderNumber: true, userId: true, createdAt: true, subtotal: true, discountTotal: true, shippingTotal: true, taxTotal: true, grandTotal: true, currency: true, status: true, paymentStatus: true, paymentMethod: true, email: true, phone: true, shippingAddressJson: true, shippingMethod: true, items: { select: { productId: true, name: true, quantity: true, unitPrice: true, totalPrice: true } } },
  })
  // An order number alone shows nothing: details need the owner's session, the view code in the
  // link checkout gave, or the order's email (lib/order-access.ts). Without one the page reads the
  // same whether or not the order exists, so it can't be used to probe order numbers either.
  if (!record || !canViewOrder(record, { userId: user?.id, token: t, email })) {
    return <><main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.hero}`}>
      <span className={s.tick}><CheckCircle2 size={34} /></span>
      <h1 className={s.title}>{tr('Thank you for shopping with us.')}</h1>
      <p className={s.lead}>{tr('To see an order, look it up with its number, or open your account.')}</p>
      <div className={s.actions} style={{ width: '100%' }}>
        <Link className={`${s.btn} ${s.btnPrimary}`} href="/orders/lookup">{tr('Look up an order')}</Link>
        {user ? <Link className={s.btn} href="/account">{tr('View account')}</Link> : <Link className={s.btn} href="/shop">{tr('Continue shopping')}</Link>}
      </div>
    </section></div></main><StoreFooter /></>
  }

  const isOwner = !!user?.id && record.userId === user.id
  const viewOrderHref = isOwner
    ? `/account/orders/${encodeURIComponent(order)}`
    : `/account/orders/${encodeURIComponent(order)}?t=${encodeURIComponent(orderViewToken(record.orderNumber))}`

  // Cancelled by the customer (Cancel my order below) or by the store, not a failed payment.
  if (record.status === 'CANCELLED' && payment !== 'failed' && record.paymentStatus !== 'FAILED') {
    return <><main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${s.tickWarn}`}><Clock size={34} /></span>
      <h1 className={s.title}>{tr('Order #{order} was cancelled', { order })}</h1>
      <p className={s.lead}>{tr('Nothing to pay. If you cancelled by mistake, you can order again, or message us on WhatsApp.')}</p>
      <div className={s.actions} style={{ width: '100%' }}>
        <Link className={`${s.btn} ${s.btnPrimary}`} href="/shop">{tr('Continue shopping')}</Link>
      </div>
    </section></div></main><StoreFooter /></>
  }

  // The card gateway sends customers here for every outcome (?payment=paid|failed|pending).
  // A failed or cancelled order must not read as "confirmed" or be reported as a sale.
  const failed = payment === 'failed' || record.paymentStatus === 'FAILED' || record.status === 'CANCELLED'
  const processing = !failed && record.paymentMethod === 'CARD' && record.paymentStatus !== 'PAID'

  if (failed) {
    return <><main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${s.tickBad}`}><AlertCircle size={34} /></span>
      <h1 className={s.title}>{tr("Your payment didn't go through.")}</h1>
      <p className={s.lead}>{tr("You haven't been charged for order #{order}. You can try again with another card or choose cash on delivery.", { order })}</p>
      <div className={s.actions} style={{ width: '100%' }}>
        <Link className={`${s.btn} ${s.btnPrimary}`} href="/cart">{tr('Back to cart')}</Link>
        <Link className={s.btn} href="/shop">{tr('Continue shopping')}</Link>
      </div>
    </section></div></main><StoreFooter /></>
  }

  const a = address(record.shippingAddressJson)
  const firstName = String(a.firstName || '').trim()
  const place = [a.region, a.city].map(x => String(x || '').trim()).filter((x, i, all) => x && all.indexOf(x) === i).join(', ')
  const cod = record.paymentMethod === 'COD'
  const paid = record.paymentStatus === 'PAID'
  const totalText = money(record.grandTotal, record.currency)
  const paymentLabel = paid ? tr('paid') : cod ? tr('cash on delivery') : record.paymentMethod === 'BANK_TRANSFER' ? tr('bank transfer') : tr('to pay')

  // "Send my order on WhatsApp": the number from Theme settings › WhatsApp button, else the
  // store's phone (Settings).
  const [contact, store, themeState] = await Promise.all([getContactInfo().catch(() => null), getStoreIdentity().catch(() => null), getThemeState().catch(() => null)])
  const storeWhatsapp = whatsappDigits(String((themeState?.theme as any)?.whatsapp?.number || '').trim() || contact?.phone || '', store?.country || 'Lebanon')
  const whatsappHref = processing ? '' : whatsappMessageLink(storeWhatsapp, customerOrderMessage({
    storeName: store?.name || '',
    orderNumber: record.orderNumber,
    items: record.items.map(i => ({ name: i.name, quantity: i.quantity })),
    total: totalText,
    paymentLabel,
    name: `${firstName} ${String(a.lastName || '').trim()}`.trim(),
    place,
  }, tr))

  // Screenshots of a transfer already sent for this order (lib/payment-proof.ts).
  const proofCount = await db.paymentProof.count({ where: { order: { orderNumber: record.orderNumber } } }).catch(() => 0)

  // Invite a friend (Settings > Selling tools): the customer's own code, made for their phone.
  const invite = processing ? null : await inviteCardFor(record, tr).catch(() => null)

  return <><main className={s.page}><div className={s.wrap}>
    <section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${processing ? s.tickWarn : ''}`}>{processing ? <Clock size={34} /> : <CheckCircle2 size={34} />}</span>
      <h1 className={s.title}>{firstName ? tr('Thank you, {name}!', { name: firstName }) : tr('Thank you for your order.')}</h1>
      <p className={s.lead}>{processing ? tr("We're waiting for your bank to confirm the payment. You'll get an email as soon as it does.") : tr('Your order is placed. Keep its number for your records.')}</p>
      <span className={s.number} dir="ltr">#{order}</span>
      {whatsappHref && <div className={s.whatsapp}>
        <p><strong>{tr('Get it confirmed faster')}</strong><br />{tr('Send us your order on WhatsApp in one tap. We reply there to confirm it.')}</p>
        <a className={s.waBtn} href={whatsappHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> {tr('Send my order on WhatsApp')}</a>
      </div>}
    </section>

    {!processing && <p className={s.small}>{tr('To cancel this order, message us on WhatsApp.')}</p>}

    {!processing && <section className={s.card}>
      <h2 className={s.cardTitle}>{tr('What happens next')}</h2>
      <ol className={s.steps}>
        <li><span className={s.stepIcon}><PhoneCall size={17} /></span><div><strong>{tr('We confirm your order')}</strong><span>{tr('We contact you on {phone} to confirm the order and the delivery time.', { phone: record.phone || tr('your phone') })}</span></div></li>
        <li><span className={s.stepIcon}><PackageCheck size={17} /></span><div><strong>{tr('We prepare and deliver it')}</strong><span>{place ? tr('The courier brings it to you in {place}.', { place }) : tr('The courier brings it to your address.')}</span></div></li>
        <li><span className={s.stepIcon}><Wallet size={17} /></span><div><strong>{paid ? tr('Already paid') : cod ? tr('You pay on delivery') : tr('Payment')}</strong><span>{paid ? tr('Nothing to pay when it arrives.') : cod ? tr('Please have {amount} ready when your order arrives.', { amount: totalText }) : tr('See the payment details below.')}</span></div></li>
      </ol>
    </section>}

    {!processing && !cod && <PaymentInstructions method={record.paymentMethod} status={record.paymentStatus} amount={totalText} orderNumber={record.orderNumber} />}
    {!processing && proofState(record, 0).allowed && <PaymentProofBox orderNumber={record.orderNumber} token={orderViewToken(record.orderNumber)} count={proofCount} />}

    <section className={s.card}>
      <h2 className={s.cardTitle}>{tr('Order summary')}</h2>
      <ul className={s.items}>{record.items.map((i, n) => <li key={n}><span>{i.quantity} × {i.name}</span><strong>{money(i.totalPrice, record.currency)}</strong></li>)}</ul>
      <div className={s.totals}>
        <div><span>{tr('Subtotal')}</span><strong>{money(record.subtotal, record.currency)}</strong></div>
        {record.discountTotal > 0 && <div className={s.saving}><span>{tr('Discount')}</span><strong>−{money(record.discountTotal, record.currency)}</strong></div>}
        <div><span>{tr('Delivery')}</span><strong>{record.shippingTotal > 0 ? money(record.shippingTotal, record.currency) : tr('Free')}</strong></div>
        {record.taxTotal > 0 && <div><span>{tr('Tax')}</span><strong>{money(record.taxTotal, record.currency)}</strong></div>}
        <div className={s.grand}><span>{tr('Total')}</span><span>{totalText}</span></div>
      </div>
      {(a.line1 || place) && <div className={s.address}><strong>{tr('Delivery to')}</strong>{[`${a.firstName || ''} ${a.lastName || ''}`.trim(), a.line1, a.line2, place, record.phone].filter(Boolean).map((line, n) => <span key={n} dir="auto">{line}</span>)}</div>}
    </section>

    {invite && <InviteShare {...invite} />}

    <div className={s.actions}>
      <Link className={`${s.btn} ${s.btnPrimary}`} href="/shop">{tr('Continue shopping')}</Link>
      <Link className={s.btn} href={viewOrderHref}>{tr('View order')}</Link>
    </div>
    {!user && <p className={s.small}><Link href="/account/register">{tr('Create an account to track future orders')}</Link></p>}
  </div>
  {!processing && <PurchaseTracker
    orderNumber={record.orderNumber}
    value={record.grandTotal / 100}
    currency={record.currency}
    items={record.items.map(i => ({ id: String(i.productId), name: i.name, price: i.unitPrice / 100, quantity: i.quantity }))}
    customer={await hashedCustomer(record.email, record.phone)}
  />}
  </main><StoreFooter /></>
}
