import type { Prisma } from '@prisma/client'
import { db } from '@/lib/prisma'

// Orders per status, e.g. { PENDING: 3, SHIPPED: 1 } (statuses with none are left out), for the
// admin orders list's views (lib/order-flow.ts ORDER_VIEWS).
export async function orderCounts(where: Prisma.OrderWhereInput = {}) {
  const groups = await db.order.groupBy({ by: ['status'], where, _count: { _all: true } })
  return Object.fromEntries(groups.map(g => [g.status, g._count._all])) as Record<string, number>
}
