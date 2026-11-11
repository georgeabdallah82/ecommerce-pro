import { unstable_cache } from 'next/cache'
import { db } from '@/lib/prisma'
import { OrderStatus } from '@prisma/client'

// The dashboard's aggregate reads. They are cached for a minute, so a busy admin does not repeat
// them on every visit. Live visitors, the newest orders and the activity log are read every time.
// Everything returned is plain JSON, which is what the cache keeps (a Date would come back as text).

const OPEN_STATUSES = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING]
const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_SECONDS = 60

export type DashboardAggregates = {
  monthlyRows: { month: string; orders: number; net: number }[]
  daily: { day: string; orders: number; net: number }[]
  toFulfill: number
  pendingReviews: number
  lowStock: number
  lowStockTop: { name: string; left: number; threshold: number }[]
  topProducts: { productId: string; sold: number }[]
  products: { id: string; name: string; basePrice: number; images: { url: string }[] }[]
}

// Net sales take off refunds for each order, never below zero (the same rule as the monthly SQL).
function netSales(order: { grandTotal: number; paymentTransactions: { status: string; amount: number }[] }) {
  const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
  return Math.max(0, order.grandTotal - refunded)
}

export async function readAggregates(timezone: string, monthFromIso: string): Promise<DashboardAggregates> {
  const now = new Date()
  const since = new Date(now.getTime() - 15 * DAY_MS)
  const since30 = new Date(now.getTime() - 30 * DAY_MS)
  const monthFrom = new Date(monthFromIso)
  const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

  const [monthlyRows, recentSales, toFulfill, pendingReviews, lowStockRows, lowStockCount, topRows] = await Promise.all([
    // Monthly totals are added up in the database: one row per month comes back, not every order.
    db.$queryRaw<{ month: string; orders: number; net: number }[]>`
      SELECT to_char(date_trunc('month', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM') AS month,
             COUNT(*)::float8 AS orders,
             COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))), 0)::float8 AS net
      FROM "Order" o
      LEFT JOIN (
        SELECT "orderId", SUM(amount) AS refunded
        FROM "PaymentTransaction"
        WHERE status IN ('refunded', 'partially_refunded')
        GROUP BY "orderId"
      ) r ON r."orderId" = o.id
      WHERE o."createdAt" >= ${monthFrom}
        AND o.status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY 1
    `,
    db.order.findMany({
      where: { createdAt: { gte: since }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
      select: { grandTotal: true, createdAt: true, paymentTransactions: { select: { status: true, amount: true } } },
    }),
    db.order.count({ where: { status: { in: OPEN_STATUSES } } }),
    db.review.count({ where: { approved: false } }),
    // The card shows the four lowest. The count is a separate query, so it covers every row.
    db.$queryRaw<{ name: string; remaining: number; threshold: number }[]>`
      SELECT p.name AS name,
             (i.quantity - i.reserved)::int AS remaining,
             i."lowStockThreshold"::int AS threshold
      FROM "InventoryItem" i
      JOIN "Product" p ON p.id = i."productId"
      WHERE i.quantity - i.reserved <= i."lowStockThreshold"
      ORDER BY (i.quantity - i.reserved) ASC
      LIMIT 4
    `,
    db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "InventoryItem" i
      WHERE i.quantity - i.reserved <= i."lowStockThreshold"
    `,
    db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: since30 } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 4,
    }),
  ])

  const productIds = topRows.map(row => row.productId)
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, basePrice: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } })
    : []

  const salesByDay = new Map<string, { net: number; orders: number }>()
  for (const order of recentSales) {
    const day = dayKey(order.createdAt)
    const entry = salesByDay.get(day) || { net: 0, orders: 0 }
    entry.net += netSales(order)
    entry.orders += 1
    salesByDay.set(day, entry)
  }

  return {
    monthlyRows: monthlyRows.map(row => ({ month: row.month, orders: Number(row.orders), net: Number(row.net) })),
    daily: [...salesByDay].map(([day, entry]) => ({ day, orders: entry.orders, net: entry.net })),
    toFulfill,
    pendingReviews,
    lowStock: Number(lowStockCount[0]?.count || 0),
    lowStockTop: lowStockRows.map(row => ({ name: row.name, left: Number(row.remaining), threshold: Number(row.threshold) })),
    topProducts: topRows.map(row => ({ productId: row.productId, sold: row._sum.quantity || 0 })),
    products: products.map(product => ({ id: product.id, name: product.name, basePrice: product.basePrice, images: product.images.map(image => ({ url: image.url })) })),
  }
}

// Cached for a minute per store timezone and month window. Both arguments are part of the cache key.
export function getDashboardAggregates(timezone: string, monthFrom: Date): Promise<DashboardAggregates> {
  return unstable_cache(readAggregates, ['admin-dashboard-aggregates'], { revalidate: CACHE_SECONDS })(timezone, monthFrom.toISOString())
}
