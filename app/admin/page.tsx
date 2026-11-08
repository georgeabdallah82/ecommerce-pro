import { requirePermission } from '@/lib/auth'
import Link from '@/components/admin-link'
import { ArrowUpRight, Boxes, ChevronRight, Eye, MessageSquare, PackageCheck, Plus } from 'lucide-react'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { OrderStatus } from '@prisma/client'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import AdminSalesChart, { type SalesDay } from '@/components/admin-sales-chart'
import ui from '@/components/admin-ui.module.css'
import s from '@/components/admin-dashboard.module.css'
import { visitorCounts } from '@/lib/visitor-report' // same numbers as the Live visitors page
import { loadErpOverview } from '@/lib/erp-overview'

const OPEN_STATUSES = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING]
const DAY_MS = 24 * 60 * 60 * 1000

type SalesOrder = { grandTotal: number; createdAt: Date; paymentTransactions: { status: string; amount: number }[] }

function netSales(order: SalesOrder) {
  const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
  return Math.max(0, order.grandTotal - refunded)
}

function change(current: number, previous: number) {
  if (!previous) return current ? { text: 'No sales this day last week', up: true } : { text: 'No sales yet', up: true }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs same day last week`, up: pct >= 0 }
}

const paymentTone = (status: string) => status === 'PAID' ? ui.statusPillSuccess : ['UNPAID', 'PENDING'].includes(status) ? ui.statusPillWarning : status === 'FAILED' ? ui.statusPillDanger : ''
const fulfillmentTone = (status: string) => ['SHIPPED', 'DELIVERED'].includes(status) ? ui.statusPillSuccess : (OPEN_STATUSES as string[]).includes(status) ? ui.statusPillWarning : ''
// Guest orders have no account: fall back to the name on the shipping address, then the email.
function customerName(order: { user?: { name: string | null } | null; email: string; shippingAddressJson: string }) {
  if (order.user?.name) return order.user.name
  try {
    const address = JSON.parse(order.shippingAddressJson || '{}')
    const name = address.name || [address.firstName, address.lastName].filter(Boolean).join(' ')
    if (name) return name
  } catch {}
  return order.email
}
const label = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')

export default async function Admin() {
  await requirePermission('dashboard.view')
  const [timezone, currency] = await Promise.all([getStoreTimezone(), getStoreCurrency()])
  const now = new Date()
  // Days are counted in the store's own timezone (Settings > Store > Timezone).
  const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const keys = [...new Set(Array.from({ length: 15 }, (_, i) => dayKey(new Date(now.getTime() - (14 - i) * DAY_MS))))].slice(-14)
  const todayKey = keys[keys.length - 1]
  const since = new Date(now.getTime() - 15 * DAY_MS)
  const monthStart = new Date(now.getTime() - 30 * DAY_MS)

  const [recentSales, toFulfill, inventoryRows, pendingReviews, orders, top, visits] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } }, select: { grandTotal: true, createdAt: true, paymentTransactions: { select: { status: true, amount: true } } } }),
    db.order.count({ where: { status: { in: OPEN_STATUSES } } }),
    db.inventoryItem.findMany({ select: { quantity: true, reserved: true, lowStockThreshold: true } }),
    db.review.count({ where: { approved: false } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { user: true, items: true } }),
    db.orderItem.groupBy({ by: ['productId'], where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: monthStart } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 4 }),
    visitorCounts(now).catch(() => ({ online: 0, today: 0, ordered: 0 })),
  ])

  // Extended (Accelerate) client payload inference doesn't always widen nested `select`
  // relations correctly, so these results are asserted to the shape actually queried.
  const salesTyped = recentSales as unknown as SalesOrder[]
  const topTyped = top as { productId: string; _sum: { quantity: number | null } }[]

  const salesByDay = new Map<string, number>(); const ordersByDay = new Map<string, number>()
  for (const order of salesTyped) {
    const key = dayKey(order.createdAt)
    salesByDay.set(key, (salesByDay.get(key) || 0) + netSales(order))
    ordersByDay.set(key, (ordersByDay.get(key) || 0) + 1)
  }
  const lastWeekKey = keys[keys.length - 8]
  const salesToday = salesByDay.get(todayKey) || 0
  const ordersToday = ordersByDay.get(todayKey) || 0
  const salesChange = change(salesToday, salesByDay.get(lastWeekKey) || 0)
  const ordersChange = change(ordersToday, ordersByDay.get(lastWeekKey) || 0)
  const visitorsNow = visits.online
  const visitorsToday = visits.today
  // Share of today's visits that placed an order (orders taken by phone or WhatsApp are not visits).
  const conversion = visitorsToday ? `${((visits.ordered / visitorsToday) * 100).toFixed(1)}%` : '—'
  const lowStock = inventoryRows.filter(row => row.quantity - row.reserved <= row.lowStockThreshold).length

  const weekday = new Intl.DateTimeFormat('en', { timeZone: timezone, weekday: 'short' })
  const longDate = new Intl.DateTimeFormat('en', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'short' })
  const chartDays: SalesDay[] = keys.slice(-7).map((key, i) => {
    const date = new Date(`${key}T12:00:00Z`)
    return { label: weekday.format(date), date: longDate.format(date), current: salesByDay.get(key) || 0, previous: salesByDay.get(keys[i]) || 0 }
  })

  const products = await db.product.findMany({ where: { id: { in: topTyped.map(x => x.productId) } }, select: { id: true, name: true, basePrice: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } })
  const productById = new Map(products.map(p => [p.id, p]))
  const erp = await loadErpOverview(now, timezone)

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const summary = toFulfill
    ? `${money(salesToday, currency)} in sales today. ${plural(toFulfill, 'order')} ${toFulfill === 1 ? 'is' : 'are'} waiting to ship.`
    : `${money(salesToday, currency)} in sales today. Every order is shipped.`

  return <div className={s.page} data-dashboard-hero>
    <section className={s.hero}>
      <div className={s.heroText}>
        <span className={s.eyebrow}>{longDate.format(now)}</span>
        <h1 className={s.greeting}>Yalla, let&rsquo;s sell! <span aria-hidden="true">🚀</span></h1>
        <p className={s.summary}>{summary}</p>
      </div>
      <div className={s.heroActions}>
        <Link className={`${ui.btn} ${s.heroGhost}`} href="/" target="_blank"><Eye size={16} /> View store</Link>
        <Link className={`${ui.btn} ${s.heroPrimary}`} href="/admin/products/new"><Plus size={16} /> Add product</Link>
      </div>
    </section>

    <div className={s.body}>
      <div className={s.kpis}>
        <div className={s.kpi}><span>Sales today</span><strong>{money(salesToday, currency)}</strong><small className={salesChange.up ? s.up : s.down}>{salesChange.text}</small></div>
        <div className={s.kpi}><span>Orders today</span><strong>{ordersToday}</strong><small className={ordersChange.up ? s.up : s.down}>{ordersChange.text}</small></div>
        <Link className={s.kpi} href="/admin/live-visitors"><span>Visitors now</span><strong>{visitorsNow}</strong><small className={s.up}><i className={s.liveDot} /> live now</small></Link>
        <div className={s.kpi}><span>Conversion today</span><strong>{conversion}</strong><small>{plural(visitorsToday, 'visitor')} today</small></div>
      </div>

      <div className={s.grid}>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Sales this week</h2><Link href="/admin/reports">View report</Link></div>
          <AdminSalesChart days={chartDays} currency={currency} />
        </section>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Needs your attention</h2></div>
          <div className={s.todo}>
            <Link href="/admin/orders"><span className={`${s.todoCount} ${s.todoRed}`}>{toFulfill}</span><PackageCheck size={16} className={s.todoIcon} />Orders to fulfill<ChevronRight size={16} className={s.chev} /></Link>
            <Link href="/admin/inventory"><span className={`${s.todoCount} ${s.todoAmber}`}>{lowStock}</span><Boxes size={16} className={s.todoIcon} />Products low on stock<ChevronRight size={16} className={s.chev} /></Link>
            <Link href="/admin/reviews"><span className={`${s.todoCount} ${s.todoGreen}`}>{pendingReviews}</span><MessageSquare size={16} className={s.todoIcon} />Reviews to approve<ChevronRight size={16} className={s.chev} /></Link>
          </div>
        </section>
      </div>

      <div className={s.grid}>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Recent orders</h2><Link href="/admin/orders">View all</Link></div>
          {orders.length ? <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable} ${s.ordersTable}`}>
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfillment</th></tr></thead>
            <tbody>{orders.map(o => <tr key={o.id}>
              <td data-cell="primary"><Link className={s.orderLink} href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td>
              <td data-label="Customer"><strong>{customerName(o)}</strong></td>
              <td data-cell="hide">{o.items.reduce((a, x) => a + x.quantity, 0)}</td>
              <td data-label="Total"><strong>{money(o.grandTotal, o.currency)}</strong></td>
              <td data-label="Payment"><span className={`${ui.statusPill} ${paymentTone(o.paymentStatus)}`}>{label(o.paymentStatus)}</span></td>
              <td data-label="Fulfillment"><span className={`${ui.statusPill} ${fulfillmentTone(o.status)}`}>{label(o.status)}</span></td>
            </tr>)}</tbody>
          </table></div> : <div className={s.empty}><strong>No orders yet</strong><p>New orders show up here as soon as customers check out.</p><Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders/new">Create an order</Link></div>}
        </section>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Top products</h2><Link href="/admin/products">All</Link></div>
          {topTyped.length ? topTyped.map(x => {
            const product = productById.get(x.productId)
            return <Link className={s.product} key={x.productId} href={`/admin/products/${x.productId}`}>
              <span className={s.thumb}>{product?.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <Boxes size={16} />}</span>
              <span className={s.productText}><strong>{product?.name || 'Deleted product'}</strong><small>{x._sum.quantity || 0} sold · last 30 days</small></span>
              {product && <em>{money(product.basePrice, currency)}</em>}
              <ArrowUpRight size={14} className={s.chev} />
            </Link>
          }) : <div className={s.empty}><strong>No sales yet</strong><p>Your best sellers from the last 30 days appear here.</p></div>}
        </section>
      </div>

      <div className={s.kpis} aria-label="Business overview">
        <div className={s.kpi}><span>Net sales this month</span><strong>{money(erp.month.netCents, currency)}</strong><small>{plural(erp.month.orders, 'order')} · refunds {money(erp.month.refundCents, currency)}</small></div>
        <div className={s.kpi}><span>Net sales, all time</span><strong>{money(erp.allTime.netCents, currency)}</strong><small>{plural(erp.allTime.orders, 'order')} · refunds {money(erp.allTime.refundCents, currency)}</small></div>
        <div className={s.kpi}><span>Online orders</span><strong>{erp.onlineOrders}</strong><small>From the store</small></div>
        <div className={s.kpi}><span>POS sales</span><strong>{erp.posOrders}</strong><small>From the till</small></div>
        <div className={s.kpi}><span>Products</span><strong>{erp.products}</strong><small>{plural(erp.stock.outOfStock, 'out of stock product')}</small></div>
        <div className={s.kpi}><span>Inventory at cost</span><strong>{money(erp.stock.valuationCents, currency)}</strong><small>{erp.stock.productsWithoutCost ? `${plural(erp.stock.productsWithoutCost, 'product')} without a cost price` : 'Stock on hand × cost price'}</small></div>
        <div className={s.kpi}><span>Gross profit this month</span><strong>{money(erp.profit.month.profitCents, currency)}</strong><small>On {money(erp.profit.month.costedRevenueCents, currency)} of sales · cost {money(erp.profit.month.costCents, currency)}{erp.profit.month.coveragePct !== null ? ` · ${erp.profit.month.coveragePct}% of sales costed` : ''}</small></div>
        <div className={s.kpi}><span>Gross profit, all time</span><strong>{money(erp.profit.allTime.profitCents, currency)}</strong><small>On {money(erp.profit.allTime.costedRevenueCents, currency)} of sales · cost {money(erp.profit.allTime.costCents, currency)}</small></div>
      </div>
      <p className={s.summary} style={{ margin: 0 }}>Revenue is what customers paid, net of refunds. Gross profit covers only items whose cost was recorded when they were sold; the coverage shows how much of the sales that is.</p>

      <div className={s.grid}>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Recent stock movements</h2><Link href="/admin/inventory">Inventory</Link></div>
          {erp.movements.length ? <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable}`}>
            <thead><tr><th>When</th><th>Product</th><th>Change</th><th>Reason</th></tr></thead>
            <tbody>{erp.movements.map((m, i) => <tr key={i}>
              <td data-label="When">{new Date(m.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td data-label="Product"><strong>{m.inventory.product.name}</strong></td>
              <td data-label="Change">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
              <td data-label="Reason">{label(m.type)}{m.reason ? ` · ${m.reason}` : ''}{m.referenceId ? ` · ${m.referenceId}` : ''}</td>
            </tr>)}</tbody>
          </table></div> : <div className={s.empty}><strong>No stock movements yet</strong><p>Every sale, receipt and adjustment is recorded here.</p></div>}
        </section>
        <section className={s.panel}>
          <div className={s.panelHead}><h2>Recent till sales</h2><span className={s.summary} style={{ margin: 0 }}>{erp.pendingPurchases} open purchase {erp.pendingPurchases === 1 ? 'order' : 'orders'}</span></div>
          {erp.posSales.length ? <div className={s.todo}>
            {erp.posSales.map(sale => <Link key={sale.orderNumber} href={`/admin/pos/receipts/${encodeURIComponent(sale.orderNumber)}`}>
              <span className={s.todoCount}>{money(sale.grandTotal, currency)}</span>
              {sale.orderNumber}<small style={{ marginLeft: 8, color: '#5f6673' }}>{sale.cashier?.name ?? ''}</small>
              <ChevronRight size={16} className={s.chev} />
            </Link>)}
          </div> : <div className={s.empty}><strong>No till sales yet</strong><p>Sales made on the till appear here with their receipts.</p></div>}
        </section>
      </div>
    </div>
  </div>
}
