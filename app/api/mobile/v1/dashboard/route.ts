import { OrderStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { startOfStoreDay } from '@/lib/store-day'
import { publicUserSelect } from '@/lib/user-public'
import { customerName } from '@/lib/mobile-orders'

const noStore = { 'Cache-Control': 'private, no-store' }
const DAY_MS = 24 * 60 * 60 * 1000
const RANGES = new Set([7, 30, 90])

// The Android admin app's dashboard in one request. Money follows the admin dashboard's rules
// (lib/admin-dashboard-data.ts): cancelled and refunded orders don't count, and refunds come off
// each order's total, never below zero. Days are the store's days (Settings > General time zone).
export async function GET(req: Request) {
  try {
    await requirePermission('dashboard.view')
    const rangeRaw = Number(new URL(req.url).searchParams.get('range') || 30)
    const range = RANGES.has(rangeRaw) ? rangeRaw : 30
    const [timezone, currency] = await Promise.all([getStoreTimezone(), getStoreCurrency()])
    const now = new Date()
    const todayStart = startOfStoreDay(now, timezone)
    const yesterdayStart = startOfStoreDay(new Date(todayStart.getTime() - DAY_MS / 2), timezone)
    const rangeStart = startOfStoreDay(new Date(now.getTime() - (range - 1) * DAY_MS), timezone)
    const previousStart = new Date(rangeStart.getTime() - range * DAY_MS)
    const since30 = new Date(now.getTime() - 30 * DAY_MS)

    const [totalsRows, byStatus, dailyRows, topRows, recent, lowRows, lowCount, outCount, pendingReviews, proofsWaiting] = await Promise.all([
      db.$queryRaw<{ orders: number; net: number; today_orders: number; today_net: number; yesterday_net: number; range_net: number; range_orders: number; previous_net: number; previous_orders: number }[]>`
        SELECT COUNT(*)::float8 AS orders,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))), 0)::float8 AS net,
               COUNT(*) FILTER (WHERE o."createdAt" >= ${todayStart})::float8 AS today_orders,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))) FILTER (WHERE o."createdAt" >= ${todayStart}), 0)::float8 AS today_net,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))) FILTER (WHERE o."createdAt" >= ${yesterdayStart} AND o."createdAt" < ${todayStart}), 0)::float8 AS yesterday_net,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))) FILTER (WHERE o."createdAt" >= ${rangeStart}), 0)::float8 AS range_net,
               COUNT(*) FILTER (WHERE o."createdAt" >= ${rangeStart})::float8 AS range_orders,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))) FILTER (WHERE o."createdAt" >= ${previousStart} AND o."createdAt" < ${rangeStart}), 0)::float8 AS previous_net,
               COUNT(*) FILTER (WHERE o."createdAt" >= ${previousStart} AND o."createdAt" < ${rangeStart})::float8 AS previous_orders
        FROM "Order" o
        LEFT JOIN (
          SELECT "orderId", SUM(amount) AS refunded FROM "PaymentTransaction"
          WHERE status IN ('refunded', 'partially_refunded') GROUP BY "orderId"
        ) r ON r."orderId" = o.id
        WHERE o.status NOT IN ('CANCELLED', 'REFUNDED')
      `,
      db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      db.$queryRaw<{ day: string; orders: number; net: number }[]>`
        SELECT to_char(date_trunc('day', (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS day,
               COUNT(*)::float8 AS orders,
               COALESCE(SUM(GREATEST(0, o."grandTotal" - COALESCE(r.refunded, 0))), 0)::float8 AS net
        FROM "Order" o
        LEFT JOIN (
          SELECT "orderId", SUM(amount) AS refunded FROM "PaymentTransaction"
          WHERE status IN ('refunded', 'partially_refunded') GROUP BY "orderId"
        ) r ON r."orderId" = o.id
        WHERE o."createdAt" >= ${rangeStart} AND o.status NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY 1 ORDER BY 1
      `,
      db.orderItem.groupBy({
        by: ['productId'],
        where: { order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, createdAt: { gte: since30 } } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: publicUserSelect }, _count: { select: { items: true } } } }),
      db.$queryRaw<{ inventory_id: string; product_id: string; name: string; variant: string | null; available: number; threshold: number }[]>`
        SELECT i.id AS inventory_id, p.id AS product_id, p.name AS name, v.name AS variant,
               (i.quantity - i.reserved)::int AS available, i."lowStockThreshold"::int AS threshold
        FROM "InventoryItem" i
        JOIN "Product" p ON p.id = i."productId"
        LEFT JOIN "ProductVariant" v ON v.id = i."variantId"
        WHERE i.quantity - i.reserved <= i."lowStockThreshold" AND p.status <> 'ARCHIVED' AND p."trackInventory" = true
        ORDER BY (i.quantity - i.reserved) ASC, p.name ASC
        LIMIT 8
      `,
      db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM "InventoryItem" i JOIN "Product" p ON p.id = i."productId"
        WHERE i.quantity - i.reserved <= i."lowStockThreshold" AND p.status <> 'ARCHIVED' AND p."trackInventory" = true
      `,
      db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM "InventoryItem" i JOIN "Product" p ON p.id = i."productId"
        WHERE i.quantity - i.reserved <= 0 AND p.status <> 'ARCHIVED' AND p."trackInventory" = true
      `,
      db.review.count({ where: { approved: false } }),
      db.order.count({ where: { paymentStatus: { in: ['UNPAID', 'PENDING'] }, paymentProofs: { some: {} }, status: { notIn: ['CANCELLED', 'REFUNDED'] } } }),
    ])

    const productIds = [...new Set([...topRows.map(row => row.productId), ...lowRows.map(row => row.product_id)])]
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true, basePrice: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } })
      : []
    const productById = new Map(products.map(product => [product.id, product]))

    // Every day of the range, including the days without an order, so the chart has no gaps.
    const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    const byDay = new Map(dailyRows.map(row => [row.day, row]))
    const daily = Array.from({ length: range }, (_, index) => {
      const key = dayKey(new Date(rangeStart.getTime() + index * DAY_MS + DAY_MS / 2))
      const row = byDay.get(key)
      return { day: key, orders: Number(row?.orders || 0), net: Number(row?.net || 0) }
    })

    const counts = Object.fromEntries(Object.values(OrderStatus).map(status => [status, 0])) as Record<OrderStatus, number>
    for (const row of byStatus) counts[row.status] = row._count._all
    const totals = totalsRows[0]
    const totalOrders = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const nonCancelledOrders = Number(totals?.orders || 0)

    return json({
      currency, timezone, range, generatedAt: now.toISOString(),
      revenue: {
        total: Number(totals?.net || 0),
        today: Number(totals?.today_net || 0),
        yesterday: Number(totals?.yesterday_net || 0),
        range: Number(totals?.range_net || 0),
        previousRange: Number(totals?.previous_net || 0),
        averageOrder: nonCancelledOrders ? Math.round(Number(totals?.net || 0) / nonCancelledOrders) : 0,
      },
      orders: {
        total: totalOrders,
        today: Number(totals?.today_orders || 0),
        range: Number(totals?.range_orders || 0),
        previousRange: Number(totals?.previous_orders || 0),
        pending: counts.PENDING,
        processing: counts.CONFIRMED + counts.PROCESSING,
        shipped: counts.SHIPPED,
        completed: counts.DELIVERED,
        cancelled: counts.CANCELLED,
        refunded: counts.REFUNDED,
        byStatus: counts,
      },
      daily,
      bestSellers: topRows.map(row => {
        const product = productById.get(row.productId)
        return { productId: row.productId, name: product?.name || 'Removed product', sku: product?.sku || '', imageUrl: product?.images[0]?.url || null, sold: row._sum.quantity || 0, revenue: row._sum.totalPrice || 0 }
      }),
      recentOrders: recent.map(order => ({
        id: order.id, orderNumber: order.orderNumber, customer: customerName(order), status: order.status, paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod, grandTotal: order.grandTotal, currency: order.currency, itemCount: order._count.items, createdAt: order.createdAt,
      })),
      lowStock: {
        count: Number(lowCount[0]?.count || 0),
        outOfStock: Number(outCount[0]?.count || 0),
        items: lowRows.map(row => ({ inventoryId: row.inventory_id, productId: row.product_id, name: row.name, variant: row.variant, available: Number(row.available), threshold: Number(row.threshold), imageUrl: productById.get(row.product_id)?.images[0]?.url || null })),
      },
      attention: { pendingReviews, paymentProofsWaiting: proofsWaiting },
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load the dashboard', 400, noStore) }
}
