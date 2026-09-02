import { requirePermission } from '@/lib/auth'
import Link from 'next/link'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { OrderStatus } from '@prisma/client'
import AdminDashboardStyles from '@/components/admin-dashboard-styles'

export default async function Admin() {
  await requirePermission('dashboard.view')
  const now = new Date()
  const day = new Date(now); day.setHours(0, 0, 0, 0)
  const month = new Date(now); month.setDate(1); month.setHours(0, 0, 0, 0)

  const [products, ordersToday, customers, revenueOrders, orders, inventoryRows, pendingReviews, newOrders, top] = await Promise.all([
    db.product.count(), db.order.count({ where: { createdAt: { gte: day }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } } }),
    db.user.count({ where: { role: 'CUSTOMER' } }), db.order.findMany({ where: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: month } }, select: { grandTotal: true, paymentTransactions: { select: { status: true, amount: true } } } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: true, items: true } }), db.inventoryItem.findMany({ select: { quantity: true, reserved: true, lowStockThreshold: true } }),
    db.review.count({ where: { approved: false } }), db.order.count({ where: { status: OrderStatus.PENDING } }), db.orderItem.groupBy({ by: ['productId'], where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: month } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }),
  ])

  const revenue = revenueOrders.reduce((sum, order) => { const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((s, t) => s + t.amount, 0); return sum + Math.max(0, order.grandTotal - refunded) }, 0)
  const lowStock = inventoryRows.filter(row => row.quantity - row.reserved <= row.lowStockThreshold).length
  const names = await db.product.findMany({ where: { id: { in: top.map(x => x.productId) } }, select: { id: true, name: true } })
  const nm = new Map(names.map(x => [x.id, x.name]))

  return <div className="adminDashboard">
    <AdminDashboardStyles />
    <div className="dashboardHero"><div><div className="eyebrow">STORE OVERVIEW</div><h2>Dashboard</h2><p>Monitor revenue, orders, customers and inventory from one workspace.</p></div><div className="dashboardActions"><Link className="btn secondary" href="/">View storefront</Link><Link className="btn" href="/admin/products/new">Add product</Link></div></div>
    <div className="dashboardKpis">
      <div className="dashboardKpi"><div className="dashboardKpiTop"><span>Revenue this month</span><span className="dashboardKpiIcon">$</span></div><strong>{money(revenue)}</strong><small>Net after recorded refunds</small></div>
      <div className="dashboardKpi"><div className="dashboardKpiTop"><span>Orders today</span><span className="dashboardKpiIcon">#</span></div><strong>{ordersToday}</strong><small>{newOrders} currently pending</small></div>
      <div className="dashboardKpi"><div className="dashboardKpiTop"><span>Customers</span><span className="dashboardKpiIcon">◎</span></div><strong>{customers}</strong><small>Registered customer accounts</small></div>
      <div className="dashboardKpi"><div className="dashboardKpiTop"><span>Products</span><span className="dashboardKpiIcon">□</span></div><strong>{products}</strong><small>{lowStock} need inventory attention</small></div>
    </div>
    <div className="dashboardGridPro">
      <section className="dashboardPanel"><div className="dashboardPanelHead"><div><h3>Needs attention</h3><p>Operational items worth checking now.</p></div><span className="pill">Live</span></div><div className="attentionGrid"><Link href="/admin/orders?status=PENDING" className="attentionCard pending"><strong>{newOrders}</strong><span>Pending orders</span></Link><Link href="/admin/inventory" className="attentionCard low"><strong>{lowStock}</strong><span>Low-stock items</span></Link><Link href="/admin/reviews" className="attentionCard reviews"><strong>{pendingReviews}</strong><span>Reviews to approve</span></Link></div></section>
      <section className="dashboardPanel"><div className="dashboardPanelHead"><div><h3>Top products</h3><p>Units sold this month.</p></div><Link className="dashboardLink" href="/admin/reports">Analytics</Link></div>{top.length ? top.map(x => <div className="topProduct" key={x.productId}><div style={{minWidth:0}}><div className="topProductName">{nm.get(x.productId) || 'Unknown product'}</div><div className="mutedSmall">Best sellers by quantity</div></div><span className="topProductQty">{x._sum.quantity || 0}</span></div>) : <div className="empty">No product sales this month.</div>}</section>
    </div>
    <section className="recentPanel"><div className="dashboardPanelHead"><div><h3>Recent orders</h3><p>Latest activity across your store.</p></div><Link className="dashboardLink" href="/admin/orders">View all</Link></div><div className="recentTableWrap"><table className="table recentTable"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td><Link className="textButton" href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td><td>{o.user?.name || o.email}</td><td>{o.items.reduce((a, x) => a + x.quantity, 0)}</td><td>{money(o.grandTotal, o.currency)}</td><td><span className="pill">{o.status as OrderStatus}</span></td></tr>)}</tbody></table></div></section>
    <div className="dashboardFoot"><span className="dashboardFootDot"/> Business data is server-calculated and admin mutations remain permission-checked and auditable.</div>
  </div>
}
