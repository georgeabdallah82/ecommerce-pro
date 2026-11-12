import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { StoreFooter } from '@/components/store-footer'
import { getLang, getT } from '@/lib/i18n-server'
import { countOf, dateLocale, statusLabel } from '@/lib/i18n'
import { realPhoto } from '@/lib/collection-photo'
import OrderThumbs from '@/components/order-thumbs'

const PAGE_SIZE = 20

export default async function AllOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const t = await getT()
  const lang = await getLang()
  const locale = dateLocale(lang)

  const u = await getCurrentUser()
  if (!u) return <><main className="section"><div className="container"><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Your orders')}</h1><div className="card" style={{ padding: 24, maxWidth: 560 }}><h2 className="accountTitle">{t('Sign in to view your orders')}</h2><div style={{ display: 'flex', gap: 10 }}><Link className="btn" href="/account/login?next=%2Faccount%2Forders">{t('Sign in')}</Link></div></div></div></main><StoreFooter /></>

  const { page: pageParam } = await searchParams
  const requestedPage = Number(pageParam) || 1
  const orderCount = await db.order.count({ where: { userId: u.id } })
  const totalPages = Math.max(1, Math.ceil(orderCount / PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)

  const orders = await db.order.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    // Each row shows what was bought: up to three product photos and the number of items.
    include: { items: { select: { quantity: true, product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } } } } } },
  })

  return <><main className="section"><div className="container">
    <Link className="textLink" href="/account">{t('Back to account')}</Link>
    <div className="sectionHead"><div><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Your orders')}</h1></div></div>
    {!orders.length ? (
      <div className="card empty"><p className="muted">{t('No orders yet.')}</p><Link href="/shop" className="btn">{t('Start shopping')}</Link></div>
    ) : (
      <div className="grid" style={{ gap: 10 }}>
        {orders.map(o => (
          <Link href={`/account/orders/${o.orderNumber}`} className="card orderCard orderRow" key={o.id}>
            <OrderThumbs photos={o.items.slice(0, 3).map(item => realPhoto(item.product?.images?.[0]?.url))} />
            <div className="orderMeta"><strong dir="ltr">#{o.orderNumber}</strong><span className="muted">{o.createdAt.toLocaleDateString(locale)} · {countOf(lang, o.items.reduce((n, item) => n + item.quantity, 0), 'item')}</span></div>
            {/* The status in the shopper's language (it showed the raw value, "CONFIRMED", in Arabic too), coloured by stage. */}
            <div><span className="pill" data-status={o.status}>{statusLabel(t, o.status)}</span><strong>{money(o.grandTotal, o.currency)}</strong></div>
          </Link>
        ))}
      </div>
    )}
    {totalPages > 1 && (
      <div className="inline" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        {page > 1 ? <Link className="btn secondary" href={`/account/orders?page=${page - 1}`}>{t('Previous')}</Link> : <span />}
        <span className="muted">{t('Page {page} of {total}', { page, total: totalPages })}</span>
        {page < totalPages ? <Link className="btn secondary" href={`/account/orders?page=${page + 1}`}>{t('Next')}</Link> : <span />}
      </div>
    )}
  </div></main><StoreFooter /></>
}
