import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, CircleSlash, Clock } from 'lucide-react'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { draftInvoiceToken, safeTokenEqual, getPaymentProvider } from '@/lib/payments'
import { PAID_STATUSES } from '@/lib/invoice-payment'
import { money } from '@/lib/config'
import { Footer } from '@/components/footer'
import InvoicePayClient from '@/components/invoice-pay-client'
import { PaymentInstructions } from '@/components/payment-instructions'
import { getContactInfo } from '@/lib/store-contact'
import { getPublicPaymentMethods } from '@/lib/payment-methods-public'
import { whatsappUrl } from '@/lib/links'
import { translator } from '@/lib/i18n'
// The order confirmation's cards (app/order/success), so paying an invoice looks like the rest of buying.
import s from '@/app/order/success/success.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// An invoice the store sent: what it is for, what is due and how to pay it. Once it is paid, cancelled or can no
// longer be paid online, a card that says so.
export default async function PayInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params
  const { token } = await searchParams
  const { theme, lang } = await getThemeState()
  const t = translator(lang)
  const draft = await db.draftOrder.findUnique({ where: { id }, include: { items: true } })
  if (!draft || !token || !safeTokenEqual(token, draftInvoiceToken(id))) notFound()
  const m = (cents: number) => money(cents, draft.currency)
  const title = t('Invoice {number}', { number: draft.orderNumber })
  const open = draft.status === 'OPEN' || draft.status === 'DRAFT'
  // A completed invoice is "already paid" only when its order is (the pay route's check); otherwise its payment never
  // went through, and the shopper is asked to contact the store. It said "already paid" either way.
  const completedOrder = draft.status === 'COMPLETED' && draft.completedOrderId
    ? await db.order.findUnique({ where: { id: draft.completedOrderId }, select: { paymentStatus: true } }).catch(() => null)
    : null
  const paid = Boolean(completedOrder && PAID_STATUSES.includes(completedOrder.paymentStatus))
  // Without a card gateway "Pay now" can only fail, so offer the ways this store does take money.
  const online = open ? (await getPaymentProvider().catch(() => null))?.name !== 'manual' : false
  const bankOn = open && !online && Boolean((await getPublicPaymentMethods().catch(() => null))?.bank)
  const contact = online || paid ? null : await getContactInfo()
  const chat = contact?.phone ? whatsappUrl(contact.phone, contact.country) : ''
  // With no phone or email saved for the store, the sentence ends there instead of on a colon.
  const contactLine = (lead: string) => (
    <p className={`${s.small} linkContact`}>
      {chat || contact?.email ? <>
        {lead}{' '}
        {chat && <><a href={chat} target="_blank" rel="noopener noreferrer">WhatsApp</a>{contact?.email ? ` ${t('or')} ` : ''}</>}
        {contact?.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`Invoice ${draft.orderNumber}`)}`} dir="ltr">{contact.email}</a>}
      </> : lead.replace(/:$/, '.')}
    </p>
  )
  const itemsTotal = draft.items.reduce((sum, item) => sum + item.totalPrice, 0)

  // Paid, cancelled, or completed without a payment: the card says so, with a way on.
  const closed = !open && (
    <section className={`${s.card} ${s.hero}`}>
      <span className={paid ? s.tick : `${s.tick} ${s.tickWarn}`} aria-hidden="true">{paid ? <CheckCircle2 size={34} /> : draft.status === 'CANCELLED' ? <CircleSlash size={34} /> : <Clock size={34} />}</span>
      <h1 className={s.title}>{title}</h1>
      <p className={s.lead}>{paid ? t('This invoice has already been paid. Thank you!') : draft.status === 'CANCELLED' ? t('This invoice is no longer available.') : t('This invoice cannot be paid online right now. Please contact us.')}</p>
      <div className="linkActions"><Link className={`${s.btn} ${s.btnPrimary}`} href="/shop">{t('Continue shopping')}</Link></div>
    </section>
  )

  return <>
    <main className={s.page}>
      <div className={s.wrap}>
        {closed || <>
          <section className={s.card}>
            <h1 className={s.title}>{title}</h1>
            <ul className={s.items}>
              {draft.items.map(item => <li key={item.id}><span dir="auto">{item.quantity} × {item.name}</span><strong dir="ltr">{m(item.totalPrice)}</strong></li>)}
            </ul>
            <div className={s.totals}>
              {/* The lines between the items and the total, when there are any (a delivery fee, a discount, tax). */}
              {itemsTotal !== draft.grandTotal && <>
                <div><span>{t('Subtotal')}</span><strong dir="ltr">{m(draft.subtotal || itemsTotal)}</strong></div>
                {draft.discountTotal > 0 && <div className={s.saving}><span>{t('Discount')}</span><strong dir="ltr">−{m(draft.discountTotal)}</strong></div>}
                {draft.shippingTotal > 0 && <div><span>{t('Delivery')}</span><strong dir="ltr">{m(draft.shippingTotal)}</strong></div>}
                {draft.taxTotal > 0 && <div><span>{t('Tax')}</span><strong dir="ltr">{m(draft.taxTotal)}</strong></div>}
              </>}
              <div className={s.grand}><span>{t('Total due')}</span><span dir="ltr">{m(draft.grandTotal)}</span></div>
            </div>
            {online && <InvoicePayClient draftOrderId={draft.id} token={token} buttonClassName={`${s.btn} ${s.btnPrimary}`} />}
          </section>
          {bankOn && <PaymentInstructions method="BANK_TRANSFER" status="PENDING" amount={m(draft.grandTotal)} orderNumber={draft.orderNumber} />}
        </>}
        {!online && !paid && contactLine(bankOn || draft.status === 'CANCELLED' ? t('Questions about this invoice? Contact us:') : t('To pay this invoice, contact us:'))}
      </div>
    </main>
    <Footer theme={theme} />
  </>
}
