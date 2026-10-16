import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Star } from 'lucide-react'
import { db } from '@/lib/prisma'
import { getT } from '@/lib/i18n-server'
import { isValidOrderReviewToken } from '@/lib/order-access'
import { orderCustomerName } from '@/lib/order-reviews'
import { StoreFooter } from '@/components/store-footer'
import OrderReviewForm from './form'
import s from './review.module.css'

export const metadata: Metadata = { title: 'Rate your order', robots: { index: false, follow: false } }

// "Rate your order": the link the store sends after delivery (WhatsApp button on the order in
// Admin, and the review email the morning job sends). The code in the link opens only this page
// for this order -- not the order's address or phone.
export default async function RateOrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ orderNumber: raw }, { t: token }] = await Promise.all([params, searchParams])
  let orderNumber = raw
  try { orderNumber = decodeURIComponent(raw) } catch {}
  const tr = await getT()
  const order = isValidOrderReviewToken(orderNumber, token)
    ? await db.order.findUnique({
        where: { orderNumber },
        select: {
          id: true, userId: true, status: true, shippingAddressJson: true,
          items: { select: { productId: true, product: { select: { id: true, name: true, slug: true, status: true, images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } } } },
        },
      })
    : null

  if (!order || order.status !== 'DELIVERED') {
    const notYet = !!order
    return <><main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.center}`}>
      <span className={s.badge}>{notYet ? <Clock size={30} /> : <Star size={30} />}</span>
      <h1 className={s.title}>{notYet ? tr('Your order is on its way') : tr('This review link is not valid')}</h1>
      <p className={s.lead}>{notYet ? tr('You can rate your order once it is delivered. Come back to this link then.') : tr('Please use the full link we sent you, or contact us and we will send it again.')}</p>
      <Link className={`${s.btn} ${s.btnPrimary}`} href="/shop">{tr('Continue shopping')}</Link>
    </section></div></main><StoreFooter /></>
  }

  const existing = await db.review.findMany({
    where: { productId: { in: order.items.map(i => i.productId) }, OR: [{ orderId: order.id }, ...(order.userId ? [{ userId: order.userId }] : [])] },
    select: { productId: true },
  })
  const rated = new Set(existing.map(r => r.productId))
  const seen = new Set<string>()
  const products = order.items.flatMap(item => {
    const p = item.product
    if (!p || p.status !== 'ACTIVE' || seen.has(p.id)) return []
    seen.add(p.id)
    return [{ id: p.id, name: p.name, slug: p.slug, image: p.images[0]?.url || '', alt: p.images[0]?.alt || p.name, rated: rated.has(p.id) }]
  })

  return <><OrderReviewForm orderNumber={orderNumber} token={String(token)} defaultName={orderCustomerName(order.shippingAddressJson)} products={products} /><StoreFooter /></>
}
