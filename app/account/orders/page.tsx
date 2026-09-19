import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { Footer } from '@/components/footer'

const PAGE_SIZE = 20

export default async function AllOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const u = await getCurrentUser()
  if (!u) return <><main className="section"><div className="container"><span className="muted">ACCOUNT</span><h1 className="h2">Your orders</h1><div className="card" style={{ padding: 24, maxWidth: 560 }}><h3>Sign in to view your orders</h3><div style={{ display: 'flex', gap: 10 }}><Link className="btn" href="/account/login">Sign in</Link></div></div></div></main><Footer /></>

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
    <Link className="textLink" href="/account">← Back to account</Link>
    <div className="sectionHead"><div><span className="muted">ACCOUNT</span><h1 className="h2">Your orders</h1></div></div>
    {!orders.length ? (
      <div className="card empty"><p className="muted">No orders yet.</p><Link href="/shop" className="btn">Start shopping</Link></div>
    ) : (
      <div className="grid" style={{ gap: 10 }}>
        {orders.map(o => (
          <Link href={`/account/orders/${o.orderNumber}`} className="card orderCard" key={o.id}>
            <div><strong>#{o.orderNumber}</strong><span className="muted">{o.createdAt.toLocaleDateString()}</span></div>
            <div><span className="pill">{o.status}</span><strong>{money(o.grandTotal, o.currency)}</strong></div>
          </Link>
        ))}
      </div>
    )}
    {totalPages > 1 && (
      <div className="inline" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        {page > 1 ? <Link className="btn secondary" href={`/account/orders?page=${page - 1}`}>← Previous</Link> : <span />}
        <span className="muted">Page {page} of {totalPages}</span>
        {page < totalPages ? <Link className="btn secondary" href={`/account/orders?page=${page + 1}`}>Next →</Link> : <span />}
      </div>
    )}
  </div></main><Footer /></>
}
