import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { StoreFooter } from '@/components/store-footer'
import { getLang, getT } from '@/lib/i18n-server'
import { dateLocale } from '@/lib/i18n'

const PAGE_SIZE = 20

export default async function AllOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const t = await getT()
  const locale = dateLocale(await getLang())

  const u = await getCurrentUser()
  if (!u) return <><main className="section"><div className="container"><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Your orders')}</h1><div className="card" style={{ padding: 24, maxWidth: 560 }}><h3>{t('Sign in to view your orders')}</h3><div style={{ display: 'flex', gap: 10 }}><Link className="btn" href="/account/login?next=%2Faccount%2Forders">{t('Sign in')}</Link></div></div></div></main><StoreFooter /></>

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
  })

  return <><main className="section"><div className="container">
    <Link className="textLink" href="/account">{t('Back to account')}</Link>
    <div className="sectionHead"><div><span className="muted">{t('ACCOUNT')}</span><h1 className="h2">{t('Your orders')}</h1></div></div>
    {!orders.length ? (
      <div className="card empty"><p className="muted">{t('No orders yet.')}</p><Link href="/shop" className="btn">{t('Start shopping')}</Link></div>
    ) : (
      <div className="grid" style={{ gap: 10 }}>
        {orders.map(o => (
          <Link href={`/account/orders/${o.orderNumber}`} className="card orderCard" key={o.id}>
            <div><strong>#{o.orderNumber}</strong><span className="muted">{o.createdAt.toLocaleDateString(locale)}</span></div>
            <div><span className="pill">{o.status}</span><strong>{money(o.grandTotal, o.currency)}</strong></div>
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
