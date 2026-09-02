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
    <style jsx>{`
      .adminDashboard{max-width:1480px;margin:0 auto;padding-bottom:38px}
      .dashboardHero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:20px;padding:4px 0 2px}.dashboardHero .eyebrow{font-size:10px;letter-spacing:.12em;font-weight:900;color:#77776f}.dashboardHero h2{margin:7px 0 5px;font-size:38px;line-height:1;letter-spacing:-.05em}.dashboardHero p{margin:0;color:#73736c;font-size:13px}.dashboardActions{display:flex;gap:8px;flex-wrap:wrap}
      .dashboardKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.dashboardKpi{padding:18px 19px;border:1px solid #e2e2dc;border-radius:17px;background:#fff;box-shadow:0 4px 15px rgba(23,23,23,.04)}.dashboardKpiTop{display:flex;justify-content:space-between;align-items:center;color:#787871;font-size:11px;font-weight:800}.dashboardKpiIcon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#f2f2ed;color:#30302b}.dashboardKpi strong{display:block;margin-top:13px;font-size:28px;line-height:1;letter-spacing:-.045em}.dashboardKpi small{display:block;margin-top:8px;color:#8a8a84;font-size:10px}
      .dashboardGridPro{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.dashboardPanel{padding:18px;border:1px solid #e2e2dc;border-radius:17px;background:#fff;box-shadow:0 4px 15px rgba(23,23,23,.035)}.dashboardPanelHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:13px}.dashboardPanelHead h3{margin:0;font-size:15px;letter-spacing:-.015em}.dashboardPanelHead p{margin:4px 0 0;color:#888881;font-size:11px}.dashboardLink{font-size:11px;font-weight:800;text-decoration:underline;text-underline-offset:3px}
      .attentionGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.attentionCard{display:block;padding:15px;border:1px solid #e5e5df;border-radius:13px;background:#fafaf8}.attentionCard:hover{background:#f4f4ef}.attentionCard strong{display:block;font-size:26px;line-height:1}.attentionCard span{display:block;margin-top:7px;color:#686861;font-size:11px;font-weight:700}.attentionCard.pending strong{color:#8a6500}.attentionCard.low strong{color:#a33b2f}.attentionCard.reviews strong{color:#5b5b8b}
      .topProduct{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #ededE8}.topProduct:last-child{border-bottom:0}.topProductName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:800}.topProductQty{font-size:12px;font-weight:900}.mutedSmall{margin-top:3px;font-size:10px;color:#8a8a84}
      .recentPanel{margin-top:14px;padding:18px;border:1px solid #e2e2dc;border-radius:17px;background:#fff;box-shadow:0 4px 15px rgba(23,23,23,.035)}.recentTableWrap{overflow:auto;border:1px solid #ecece7;border-radius:12px}.recentTable{min-width:760px}.recentTable td:first-child{font-weight:800}.statusPill{font-weight:850!important}
      .dashboardFoot{display:flex;align-items:center;gap:8px;margin-top:12px;color:#85857e;font-size:10px}.dashboardFootDot{width:6px;height:6px;border-radius:50%;background:#31a66a}
      @media(max-width:1000px){.dashboardKpis{grid-template-columns:repeat(2,1fr)}.dashboardGridPro{grid-template-columns:1fr}}
      @media(max-width:650px){.dashboardHero{align-items:flex-start;flex-direction:column}.dashboardHero h2{font-size:31px}.dashboardActions{width:100%}.dashboardActions>*{flex:1}.dashboardKpis{grid-template-columns:1fr 1fr}.attentionGrid{grid-template-columns:1fr}}
      @media(max-width:430px){.dashboardKpis{grid-template-columns:1fr}}
      html[data-admin-theme='dark'] .dashboardHero .eyebrow,html[data-admin-theme='dark'] .dashboardHero p,html[data-admin-theme='dark'] .dashboardKpiTop,html[data-admin-theme='dark'] .dashboardKpi small,html[data-admin-theme='dark'] .dashboardPanelHead p,html[data-admin-theme='dark'] .mutedSmall,html[data-admin-theme='dark'] .dashboardFoot{color:#9ba49e!important}
      html[data-admin-theme='dark'] .dashboardKpiIcon{background:#232724;color:#dce3de}.attentionCard{color:inherit}html[data-admin-theme='dark'] .attentionCard{background:#151817;border-color:#303631}.topProduct{border-color:#2b302c}.recentTableWrap{border-color:#2b302c}
    `}</style>
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
