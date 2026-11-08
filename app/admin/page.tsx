import { requirePermission } from '@/lib/auth'
import Link from '@/components/admin-link'
import { ArrowUpRight, Boxes, ChevronRight, Eye, MessageSquare, PackageCheck, Percent, Plus, ShoppingBag, Users, Wallet } from 'lucide-react'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { OrderStatus } from '@prisma/client'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { hasPermission } from '@/lib/permissions'
import { dashboardAccess } from '@/lib/dashboard-access'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { MonthlyBars, YearAreas, Gauge } from '@/components/admin-dashboard-charts'
import ui from '@/components/admin-ui.module.css'
import s from '@/components/admin-dashboard.module.css'
import v from '@/components/admin-dashboard-v2.module.css'
import { visitorCounts } from '@/lib/visitor-report' // same numbers as the Live visitors page

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
// Plain words for an audit action such as "product.update" on "Product".
const nextStep = (status: string) => status === 'PENDING' ? 'Confirm' : status === 'CONFIRMED' || status === 'PROCESSING' ? 'Mark shipped' : status === 'SHIPPED' ? 'Mark delivered' : 'View'
const activityText = (action: string, entity: string) => `${action.replace(/[._]/g, ' ').toLowerCase()} on ${entity.toLowerCase()}`

export default async function Admin() {
  const user = await requirePermission('dashboard.view')
  // What this person may see. Money, the activity log and stock are gated by their own permissions.
  const access = dashboardAccess(permission => hasPermission(user, permission))
  const [timezone, currency] = await Promise.all([getStoreTimezone(), getStoreCurrency()])
  const now = new Date()
  // Days are counted in the store's own timezone (Settings > Store > Timezone).
  const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const monthKey = (date: Date) => dayKey(date).slice(0, 7)
  const keys = [...new Set(Array.from({ length: 15 }, (_, i) => dayKey(new Date(now.getTime() - (14 - i) * DAY_MS))))].slice(-14)
  const todayKey = keys[keys.length - 1]
  const since = new Date(now.getTime() - 15 * DAY_MS)
  // The last 24 calendar months, oldest first, for the charts.
  const monthKeys: string[] = []
  for (let i = 23; i >= 0; i--) { const d = new Date(now); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); monthKeys.push(monthKey(d)) }
  const monthStart = new Date(`${monthKeys[0]}-01T00:00:00Z`)
  const monthStartDay = new Date(monthStart.getTime() - DAY_MS)
  const monthly = await db.order.findMany({ where: { createdAt: { gte: monthStartDay }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } }, select: { grandTotal: true, createdAt: true, paymentTransactions: { select: { status: true, amount: true } } } })
  const montho = monthly as unknown as SalesOrder[]
  const monthlySales = new Map<string, number>(); const monthlyOrders = new Map<string, number>()
  for (const order of montho) {
    const key = monthKey(order.createdAt)
    monthlySales.set(key, (monthlySales.get(key) || 0) + netSales(order))
    monthlyOrders.set(key, (monthlyOrders.get(key) || 0) + 1)
  }

  const [recentSales, toFulfill, inventoryRows, pendingReviews, orders, top, visits] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } }, select: { grandTotal: true, createdAt: true, paymentTransactions: { select: { status: true, amount: true } } } }),
    db.order.count({ where: { status: { in: OPEN_STATUSES } } }),
    db.inventoryItem.findMany({ select: { quantity: true, reserved: true, lowStockThreshold: true, product: { select: { name: true } } } }),
    db.review.count({ where: { approved: false } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { user: true, items: true } }),
    db.orderItem.groupBy({ by: ['productId'], where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 4 }),
    visitorCounts(now).catch(() => ({ online: 0, today: 0, ordered: 0 })),
  ])
  // The activity log is read only by people allowed to see it.
  const activity = access.activity ? await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, entity: true, createdAt: true, actor: { select: { name: true, email: true } } } }) : []

  // Extended (Accelerate) client payload inference doesn't always widen nested `select`
  // relations correctly, so these results are asserted to the shape actually queried.
  const salesTyped = recentSales as unknown as SalesOrder[]
  const topTyped = top as unknown as { productId: string; _sum: { quantity: number | null } }[]

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

  const inventory = inventoryRows as unknown as { quantity: number; reserved: number; lowStockThreshold: number; product: { name: string } }[]
  const lowItems = inventory
    .filter(row => row.quantity - row.reserved <= row.lowStockThreshold)
    .map(row => ({ name: row.product.name, left: row.quantity - row.reserved, threshold: row.lowStockThreshold }))
    .sort((a, b) => a.left - b.left)
  const lowStock = lowItems.length

  // Month so far against all of last month: a pace figure from real sales, no target needed.
  const thisMonth = monthKeys[monthKeys.length - 1]
  const lastMonth = monthKeys[monthKeys.length - 2]
  const monthSoFar = monthlySales.get(thisMonth) || 0
  const lastMonthTotal = monthlySales.get(lastMonth) || 0
  const paceRaw = lastMonthTotal ? (monthSoFar / lastMonthTotal) * 100 : null
  const [yearNow, monthNow] = thisMonth.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(yearNow, monthNow, 0)).getUTCDate()
  const daysLeft = daysInMonth - Number(todayKey.slice(8, 10))

  const last12 = monthKeys.slice(12).reduce((t, k) => t + (monthlySales.get(k) || 0), 0)
  const previous12 = monthKeys.slice(0, 12).reduce((t, k) => t + (monthlySales.get(k) || 0), 0)
  const yoy = previous12 ? ((last12 - previous12) / previous12) * 100 : null
  const quarterGroups = (keys: string[]) => Array.from({ length: Math.ceil(keys.length / 3) }, (_, i) => keys.slice(i * 3, i * 3 + 3))
  const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
  const monthLabel = (key: string) => shortMonth.format(new Date(`${key}-15T12:00:00Z`))
  const formatCompact = (cents: number) => new Intl.NumberFormat('en', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
  const bars = monthKeys.slice(12).map(key => ({ label: monthLabel(key), value: monthlyOrders.get(key) || 0, title: `${monthLabel(key)}: ${monthlyOrders.get(key) || 0} orders`, highlight: key === thisMonth }))
  const busiest = bars.reduce((best, bar) => (bar.value > best.value ? bar : best), bars[0] || { label: '', value: 0, title: '', highlight: false })

  const products = await db.product.findMany({ where: { id: { in: topTyped.map(x => x.productId) } }, select: { id: true, name: true, basePrice: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } })
  const productById = new Map(products.map(p => [p.id, p]))

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const salesLine = access.money ? `${money(salesToday, currency)} in sales today. ` : ''
  const summary = toFulfill
    ? `${salesLine}${plural(toFulfill, 'order')} ${toFulfill === 1 ? 'is' : 'are'} waiting to ship.`
    : `${salesLine}Every order is shipped.`
  // The greeting follows the store's clock, not the server's.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now))
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return <div className={v.page}>
    <header className={v.head}>
      <div>
        <div className={v.eyebrow}>{new Intl.DateTimeFormat('en', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</div>
        <h1 className={v.title}>{greeting}</h1>
        <p className={v.summary}>{summary}</p>
      </div>
      <div className={v.actions}>
        <Link className={ui.btn} href="/" target="_blank"><Eye size={16} /> View store</Link>
        <Link className={ui.btn} href="/admin/orders/new"><Plus size={16} /> Create order</Link>
      </div>
    </header>

    <section className={v.needs} aria-label="Needs attention">
      <span className={v.needsLabel}>Needs attention</span>
      <Link className={v.needsItem} href="/admin/orders"><b>{toFulfill}</b> orders to fulfill <span>Review</span></Link>
      {access.stock && <Link className={v.needsItem} href="/admin/inventory"><b>{lowStock}</b> low on stock <span>Restock</span></Link>}
      <Link className={v.needsItem} href="/admin/reviews"><b>{pendingReviews}</b> reviews to approve <span>Open</span></Link>
    </section>

    <div className={v.kpis}>
      {access.money && <div className={v.kpi}>
        <span className={v.kpiTop}><span className={v.kpiIcon}><Wallet size={18} /></span><span className={v.kpiLabel}>Sales today</span></span>
        <div className={v.kpiRow}><strong className={v.kpiValue}>{money(salesToday, currency)}</strong><span className={salesChange.up ? v.delta : v.deltaDown}>{salesChange.text}</span></div>
      </div>}
      <div className={v.kpi}>
        <span className={v.kpiTop}><span className={v.kpiIcon}><ShoppingBag size={18} /></span><span className={v.kpiLabel}>Orders today</span></span>
        <div className={v.kpiRow}><strong className={v.kpiValue}>{ordersToday}</strong><span className={ordersChange.up ? v.delta : v.deltaDown}>{ordersChange.text}</span></div>
      </div>
      <Link className={v.kpi} href="/admin/live-visitors">
        <span className={v.kpiTop}><span className={v.kpiIcon}><Users size={18} /></span><span className={v.kpiLabel}>Visitors now</span></span>
        <div className={v.kpiRow}><strong className={v.kpiValue}>{visitorsNow}</strong><span className={v.delta}><i className={v.live} />live now</span></div>
      </Link>
      <div className={v.kpi}>
        <span className={v.kpiTop}><span className={v.kpiIcon}><Percent size={18} /></span><span className={v.kpiLabel}>Conversion today</span></span>
        <div className={v.kpiRow}><strong className={v.kpiValue}>{conversion}</strong><span className={v.deltaNeutral}>{visitorsToday ? `${plural(visitorsToday, 'visitor')} today` : 'No visitors yet today'}</span></div>
      </div>
    </div>

    <div className={v.row}>
      <section className={v.card} aria-labelledby="orders-by-month">
        <div className={v.cardHead}>
          <div><h2 id="orders-by-month" className={v.cardTitle}>Orders per month</h2><p className={v.cardSub}>Last 12 months{busiest.value ? `, busiest in ${busiest.label}` : ''}</p></div>
        </div>
        <MonthlyBars bars={bars} label={`Orders per month for the last 12 months. ${busiest.label ? `Busiest month ${busiest.label} with ${busiest.value} orders.` : 'No orders yet.'}`} />
      </section>
      {access.money && <section className={v.card} aria-labelledby="pace">
        <div className={v.cardHead}>
          <div><h2 id="pace" className={v.cardTitle}>This month so far</h2><p className={v.cardSub}>Sales so far against all of last month, {daysLeft} days left</p></div>
        </div>
        <div className={v.gaugeWrap}>
          <Gauge percent={paceRaw} label={paceRaw == null ? 'No sales last month to compare with' : `${Math.round(paceRaw)} percent of last month's sales so far`} />
          <div className={v.gaugePct}>{paceRaw == null ? '—' : `${Math.round(paceRaw)}%`}</div>
        </div>
        <div className={v.gaugeFacts}>
          <div><span>Last month</span><strong>{formatCompact(lastMonthTotal)}</strong></div>
          <div><span>This month</span><strong>{formatCompact(monthSoFar)}</strong></div>
          <div><span>Today</span><strong>{formatCompact(salesToday)}</strong></div>
        </div>
      </section>}
    </div>

    {access.money && <section className={v.card} aria-labelledby="stats-h">
      <input type="radio" name="sales-period" id="stats-m" className={v.radio} defaultChecked />
      <input type="radio" name="sales-period" id="stats-q" className={v.radio} />
      <input type="radio" name="sales-period" id="stats-a" className={v.radio} />
      <div className={v.cardHead}>
        <div><h2 id="stats-h" className={v.cardTitle}>Sales</h2><p className={v.cardSub}>Net sales against the same period a year earlier</p></div>
        <div className={v.tabs} role="group" aria-label="Period">
          <label htmlFor="stats-m" className={v.tab}>Monthly</label>
          <label htmlFor="stats-q" className={v.tab}>Quarterly</label>
          <label htmlFor="stats-a" className={v.tab}>Annually</label>
        </div>
      </div>
      <div className={v.legend}><span><i style={{ background: 'var(--admin-accent)' }} />Last 12 months</span><span><i style={{ background: 'var(--admin-muted-soft)' }} />Same period last year</span></div>
      <div className={v.panelM}>
        <YearAreas labels={monthKeys.slice(12).map(monthLabel)} current={monthKeys.slice(12).map(key => monthlySales.get(key) || 0)} previous={monthKeys.slice(0, 12).map(key => monthlySales.get(key) || 0)} format={formatCompact} label="Net sales per month, last 12 months against the same months a year earlier" />
      </div>
      <div className={v.panelQ}>
        <YearAreas labels={quarterGroups(monthKeys.slice(12)).map(group => `${group[0]}–${group[group.length - 1]}`)} current={quarterGroups(monthKeys.slice(12)).map(group => group.reduce((t, k) => t + (monthlySales.get(k) || 0), 0))} previous={quarterGroups(monthKeys.slice(0, 12)).map(group => group.reduce((t, k) => t + (monthlySales.get(k) || 0), 0))} format={formatCompact} label="Net sales per quarter, last 12 months against the same quarters a year earlier" />
      </div>
      <div className={v.panelA}>
        <div className={v.annual}>
          <div><span>Previous 12 months</span><strong>{formatCompact(previous12)}</strong></div>
          <div><span>Last 12 months</span><strong>{formatCompact(last12)}</strong></div>
          {yoy == null ? <span className={v.deltaNeutral}>No sales a year earlier</span> : <span className={yoy >= 0 ? v.delta : v.deltaDown}>{yoy >= 0 ? '+' : ''}{Math.round(yoy)}% vs previous 12 months</span>}
        </div>
      </div>
    </section>}

    <div className={v.row}>
      <section className={s.panel} aria-labelledby="recent-orders">
        <div className={s.panelHead}><h2 id="recent-orders">Recent orders</h2><Link href="/admin/orders">View all</Link></div>
        {orders.length ? <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable} ${s.ordersTable}`}>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>Next step</th></tr></thead>
          <tbody>{orders.map(o => <tr key={o.id}>
            <td data-cell="primary"><Link className={s.orderLink} href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link></td>
            <td data-label="Customer"><strong>{customerName(o)}</strong></td>
            <td data-cell="hide">{o.items.reduce((a, x) => a + x.quantity, 0)}</td>
            <td data-label="Total"><strong>{money(o.grandTotal, o.currency)}</strong></td>
            <td data-label="Payment"><span className={`${ui.statusPill} ${paymentTone(o.paymentStatus)}`}>{label(o.paymentStatus)}</span></td>
            <td data-label="Fulfillment"><span className={`${ui.statusPill} ${fulfillmentTone(o.status)}`}>{label(o.status)}</span></td>
              <td data-label="Next step"><Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/orders/${o.id}`}>{nextStep(o.status)}</Link></td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>No orders yet</strong><p>New orders show up here as soon as customers check out.</p><Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders/new">Create an order</Link></div>}
      </section>

      {access.stock && <section className={v.card} aria-labelledby="low-stock">
        <div className={v.cardHead}>
          <div><h2 id="low-stock" className={v.cardTitle}>Low stock</h2><p className={v.cardSub}>{lowStock ? `${plural(lowStock, 'product')} at or below the threshold` : 'Nothing is running low'}</p></div>
          <Link className={v.cardLink} href="/admin/inventory">Inventory</Link>
        </div>
        {lowItems.length ? <div className={v.lowList}>{lowItems.slice(0, 4).map(item => {
          const pct = Math.max(0, Math.min(100, Math.round((item.left / Math.max(1, item.threshold)) * 100)))
          return <div className={v.lowRow} key={item.name + item.left}>
            <div className={v.lowTop}><b>{item.name}</b><small>{item.left} left</small></div>
            <div className={`${v.meter} ${item.left <= 0 ? v.meterOut : ''}`} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
          </div>
        })}</div> : <div className={s.empty}><strong>All stocked</strong><p>Products appear here when they reach their low-stock threshold.</p></div>}
      </section>}
    </div>

    <div className={v.row}>
      <section className={s.panel} aria-labelledby="top-products">
        <div className={s.panelHead}><h2 id="top-products">Top products</h2><Link href="/admin/products">All</Link></div>
        {topTyped.length ? topTyped.map(x => {
          const product = productById.get(x.productId)
          return <Link className={s.product} key={x.productId} href={`/admin/products/${x.productId}`}>
            <span className={s.thumb}>{product?.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <Boxes size={16} />}</span>
            <span className={s.productText}><strong>{product?.name || 'Deleted product'}</strong><small>{x._sum.quantity || 0} sold · last 30 days</small></span>
            {product && access.money && <em>{money(product.basePrice, currency)}</em>}
            <ArrowUpRight size={14} className={s.chev} />
          </Link>
        }) : <div className={s.empty}><strong>No sales yet</strong><p>Your best sellers from the last 30 days appear here.</p></div>}
      </section>

      {access.activity && <section className={s.panel} aria-labelledby="activity-h">
        <div className={s.panelHead}><h2 id="activity-h">Recent activity</h2></div>
        {activity.length ? <ol className={s.activity}>{activity.map(entry => <li key={entry.id}>
          <span><strong>{entry.actor?.name || entry.actor?.email || 'System'}</strong> {activityText(entry.action, entry.entity)}</span>
          <small><time dateTime={entry.createdAt.toISOString()}>{formatAdminDateTime(entry.createdAt, timezone)}</time></small>
        </li>)}</ol> : <div className={s.empty}><strong>No activity yet</strong><p>Changes staff make to orders, products and settings are listed here.</p></div>}
      </section>}
    </div>
  </div>
}
