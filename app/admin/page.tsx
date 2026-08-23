import { requirePermission } from '@/lib/auth'
import Link from 'next/link'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { OrderStatus } from '@prisma/client'

export default async function Admin() {
  await requirePermission('dashboard.view')
  const now = new Date()
  const day = new Date(now); day.setHours(0, 0, 0, 0)
  const month = new Date(now); month.setDate(1); month.setHours(0, 0, 0, 0)

  const [products, ordersToday, customers, revenueOrders, orders, lowStock, pendingReviews, newOrders, top] = await Promise.all([
    db.product.count(),
    db.order.count({ where: { createdAt: { gte: day }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.order.findMany({
      where: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: month } },
      select: { grandTotal: true, paymentTransactions: { select: { status: true, amount: true } } },
    }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: true, items: true } }),
    db.inventoryItem.count({ where: { quantity: { lte: 5 } } }),
    db.review.count({ where: { approved: false } }),
    db.order.count({ where: { status: OrderStatus.PENDING } }),
    db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
  ])

  const revenue = revenueOrders.reduce((sum, order) => {
    const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((s, t) => s + t.amount, 0)
    return sum + Math.max(0, order.grandTotal - refunded)
  }, 0)
  const names = await db.product.findMany({ where: { id: { in: top.map(x => x.productId) } }, select: { id: true, name: true } })
  const nm = new Map(names.map(x => [x.id, x.name]))

  return <div>
    <div className="sectionHead"><div><span className="muted">OVERVIEW</span><h1 className="h2">Dashboard</h1><p className="muted">Live store operations and business health.</p></div><div className="inline"><Link className="btn secondary" href="/shop">View store</Link><Link className="btn" href="/admin/products">Add product</Link></div></div>
    <div className="grid stats">
      <div className="card stat"><span className="muted">Revenue this month</span><strong>{money(revenue)}</strong></div>
      <div className="card stat"><span className="muted">Orders today</span><strong>{ordersToday}</strong></div>
      <div className="card stat"><span className="muted">Customers</span><strong>{customers}</strong></div>
      <div className="card stat"><span className="muted">Products</span><strong>{products}</strong></div>
    </div>
    <div className="grid dashboardGrid">
      <section className="card adminPanel"><div className="sectionHead small"><h3>Needs attention</h3></div><div className="grid alertGrid"><Link href="/admin/orders?status=PENDING" className="miniAlert"><strong>{newOrders}</strong><span className="muted">Pending orders</span></Link><Link href="/admin/inventory" className="miniAlert"><strong>{lowStock}</strong><span className="muted">Low-stock items</span></Link><Link href="/admin/reviews" className="miniAlert"><strong>{pendingReviews}</strong><span className="muted">Reviews waiting</span></Link></div></section>
      <section className="card adminPanel"><div className="sectionHead small"><h3>Top products</h3><Link className="textLink" href="/admin/reports">Reports →</Link></div>{top.map(x => <div className="summaryLine" key={x.productId}><span>{nm.get(x.productId) || 'Unknown product'}</span><strong>{x._sum.quantity || 0}</strong></div>)}</section>
    </div>
    <section className="card adminPanel"><div className="sectionHead small"><h3>Recent orders</h3><Link className="textLink" href="/admin/orders">View all →</Link></div><div className="cardInnerTable"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>#{o.orderNumber}</td><td>{o.user?.name || o.email}</td><td>{o.items.reduce((a, x) => a + x.quantity, 0)}</td><td>{money(o.grandTotal, o.currency)}</td><td><span className="pill">{o.status as OrderStatus}</span></td></tr>)}</tbody></table></div></section>
    <div className="muted" style={{ fontSize: 13 }}>Business data is server-calculated. Every admin mutation is permission-checked and auditable.</div>
  </div>
}
