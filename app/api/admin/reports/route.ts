import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { reportRows, REPORT_INVENTORY_CAP, REPORT_ORDER_CAP } from '@/lib/admin-list'
import { UserError } from '@/lib/user-error'
import { OrderStatus } from '@prisma/client'

export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const { searchParams } = new URL(req.url)
    const parsedDays = Number(searchParams.get('days') || 30)
    const days = Number.isFinite(parsedDays) ? Math.min(365, Math.max(1, Math.floor(parsedDays))) : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [orderRows, inventoryRows, customers] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, status: { not: OrderStatus.CANCELLED } },
        select: {
          grandTotal: true,
          items: { select: { quantity: true, totalPrice: true } },
          paymentTransactions: { select: { status: true, amount: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: REPORT_ORDER_CAP + 1,
      }),
      db.inventoryItem.findMany({
        include: { product: { select: { id: true, name: true, sku: true } }, variant: { select: { id: true, name: true, sku: true } } },
        take: REPORT_INVENTORY_CAP + 1,
      }),
      db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: since } } }),
    ])
    // A report that cannot read every row is refused, not cut: its totals would be wrong.
    const orders = reportRows(orderRows, REPORT_ORDER_CAP, 'This period has more orders than the report can read. Choose fewer days.')
    const inventory = reportRows(inventoryRows, REPORT_INVENTORY_CAP, 'The store has more inventory rows than this report can read.')

    const revenue = orders.reduce((sum, o) => {
      const refunded = o.paymentTransactions
        .filter(t => ['refunded', 'partially_refunded'].includes(t.status))
        .reduce((s, t) => s + t.amount, 0)
      return sum + Math.max(0, o.grandTotal - refunded)
    }, 0)
    const itemCount = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)
    const salesValue = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.totalPrice, 0), 0)
    const lowStockItems = inventory.filter(i => i.quantity - i.reserved <= i.lowStockThreshold).map(i => ({
      productId: i.productId,
      product: i.product.name,
      sku: i.variant?.sku ?? i.product.sku,
      variant: i.variant?.name ?? null,
      quantity: i.quantity,
      reserved: i.reserved,
      available: Math.max(0, i.quantity - i.reserved),
      threshold: i.lowStockThreshold,
    }))

    return json({
      periodDays: days,
      orders: orders.length,
      revenue,
      averageOrderValue: orders.length ? Math.round(revenue / orders.length) : 0,
      itemsSold: itemCount,
      salesValue,
      newCustomers: customers,
      lowStock: lowStockItems,
    })
  } catch (error) {
    if (error instanceof UserError) return json({ error: error.message, code: error.code }, { status: error.status ?? 400 })
    const message = error instanceof Error ? error.message : 'Unable to load report'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 401 })
  }
}
