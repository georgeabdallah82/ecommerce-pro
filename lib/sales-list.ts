// The unified sales list: online orders and till sales in one place, filtered on the server.

import { OrderChannel, OrderStatus, PaymentStatus, type Prisma } from '@prisma/client'

export type SalesFilters = {
  channel?: string
  status?: string
  payment?: string
  from?: string
  to?: string
  productId?: string
  customerId?: string
  q?: string
}

const DAY = 24 * 60 * 60 * 1000

/**
 * The instant midnight starts on a calendar day (YYYY-MM-DD) in a timezone. Works out the zone's
 * offset at that moment, so a day is counted the way the store counts it.
 */
export function startOfDayIn(day: string, timezone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const utcMidnight = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(utcMidnight.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(utcMidnight)
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'))
  const offset = asUtc - utcMidnight.getTime()
  return new Date(utcMidnight.getTime() - offset)
}

/**
 * Turns the filters from the page into a database filter. Unknown values are ignored rather than
 * matched, so a bad link shows everything instead of nothing.
 */
export function salesWhere(filters: SalesFilters, timezone: string): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {}
  if (filters.channel === 'ONLINE' || filters.channel === 'POS') where.channel = filters.channel as OrderChannel
  if (filters.status && (Object.values(OrderStatus) as string[]).includes(filters.status)) where.status = filters.status as OrderStatus
  if (filters.payment && (Object.values(PaymentStatus) as string[]).includes(filters.payment)) where.paymentStatus = filters.payment as PaymentStatus

  const from = filters.from ? startOfDayIn(filters.from, timezone) : null
  const to = filters.to ? startOfDayIn(filters.to, timezone) : null
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      // "To" includes the whole of that day, so the window ends at the next midnight.
      ...(to ? { lt: new Date(to.getTime() + DAY) } : {}),
    }
  }
  if (filters.productId) where.items = { some: { productId: filters.productId } }
  if (filters.customerId) where.userId = filters.customerId

  const q = filters.q?.trim().slice(0, 80)
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
    ]
  }
  return where
}
