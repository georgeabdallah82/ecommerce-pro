import { db } from '@/lib/prisma'
import { orderValue, commissionFor, summarizeInfluencer, type InfluencerInput, type InfluencerStats } from '@/lib/influencers-shared'

// Influencer codes (Admin > Marketing > Influencers). The code itself is an ordinary discount (a
// Coupon row), so the price at checkout, usage counts and expiry all work as they do for any other
// code. The Influencer row adds who it belongs to and how much they earn; orders are matched by
// the code written on them (Order.couponCode), so nothing on the order table changes.

const TAKEN = 'That code is already used by another discount or customer. Choose a different code.'

export type InfluencerOrder = { id: string; orderNumber: string; status: string; createdAt: Date; value: number; commission: number; currency: string }
export type InfluencerRow = {
  id: string; name: string; handle: string; phone: string; code: string; customerPercent: number; commissionPercent: number
  isActive: boolean; notes: string; createdAt: Date
  stats: InfluencerStats
  recentOrders: InfluencerOrder[]
  payouts: Array<{ id: string; amount: number; note: string; paidAt: Date }>
}

export async function loadInfluencers(): Promise<InfluencerRow[]> {
  const list = await db.influencer.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: { payouts: { orderBy: [{ paidAt: 'desc' }, { id: 'asc' }] } } })
  if (!list.length) return []
  const orders = await db.order.findMany({
    where: { couponCode: { in: list.map(i => i.code) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 5000,
    select: {
      id: true, orderNumber: true, status: true, createdAt: true, couponCode: true, subtotal: true, discountTotal: true, grandTotal: true, currency: true,
      paymentTransactions: { select: { status: true, amount: true } },
    },
  })
  return list.map(influencer => {
    const mine = orders.filter(o => o.couponCode === influencer.code).map(o => ({
      id: o.id, orderNumber: o.orderNumber, status: o.status as string, createdAt: o.createdAt, currency: o.currency,
      subtotal: o.subtotal, discountTotal: o.discountTotal, grandTotal: o.grandTotal,
      refunded: o.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0),
    }))
    const paid = influencer.payouts.reduce((sum, p) => sum + p.amount, 0)
    return {
      id: influencer.id, name: influencer.name, handle: influencer.handle || '', phone: influencer.phone || '', code: influencer.code,
      customerPercent: influencer.customerPercent, commissionPercent: influencer.commissionPercent, isActive: influencer.isActive,
      notes: influencer.notes || '', createdAt: influencer.createdAt,
      stats: summarizeInfluencer(mine, influencer.commissionPercent, paid),
      recentOrders: mine.slice(0, 8).map(o => {
        const value = orderValue(o)
        return { id: o.id, orderNumber: o.orderNumber, status: o.status, createdAt: o.createdAt, currency: o.currency, value, commission: o.status === 'DELIVERED' ? commissionFor(value, influencer.commissionPercent) : 0 }
      }),
      payouts: influencer.payouts.map(p => ({ id: p.id, amount: p.amount, note: p.note || '', paidAt: p.paidAt })),
    }
  })
}

export async function createInfluencer(input: InfluencerInput) {
  return db.$transaction(async tx => {
    const [coupon, invite, influencer] = await Promise.all([
      tx.coupon.findUnique({ where: { code: input.code }, select: { id: true } }),
      tx.inviteCode.findUnique({ where: { code: input.code }, select: { code: true } }),
      tx.influencer.findUnique({ where: { code: input.code }, select: { id: true } }),
    ])
    if (coupon || invite || influencer) throw new Error(TAKEN)
    await tx.coupon.create({ data: { code: input.code, type: 'PERCENTAGE', value: input.customerPercent, isActive: true } })
    return tx.influencer.create({
      data: { name: input.name, handle: input.handle || null, phone: input.phone || null, code: input.code, customerPercent: input.customerPercent, commissionPercent: input.commissionPercent, notes: input.notes || null },
    })
  })
}

// The code never changes (orders carry it); the rest can. The customer's discount and whether the
// code works follow the influencer's settings.
export async function updateInfluencer(id: string, input: Omit<InfluencerInput, 'code'>, isActive: boolean) {
  return db.$transaction(async tx => {
    const current = await tx.influencer.findUnique({ where: { id } })
    if (!current) throw new Error('Influencer not found')
    await tx.coupon.updateMany({ where: { code: current.code }, data: { value: input.customerPercent, isActive } })
    return tx.influencer.update({
      where: { id },
      data: { name: input.name, handle: input.handle || null, phone: input.phone || null, customerPercent: input.customerPercent, commissionPercent: input.commissionPercent, notes: input.notes || null, isActive },
    })
  })
}

// Only an influencer nobody ordered with and nobody was paid can be removed; otherwise pause it.
export async function deleteInfluencer(id: string) {
  return db.$transaction(async tx => {
    const current = await tx.influencer.findUnique({ where: { id }, select: { id: true, code: true, name: true } })
    if (!current) throw new Error('Influencer not found')
    const [orders, payouts] = await Promise.all([tx.order.count({ where: { couponCode: current.code } }), tx.influencerPayout.count({ where: { influencerId: id } })])
    if (orders || payouts) throw new Error('This influencer already has orders or payments, so it cannot be removed. Pause it instead.')
    await tx.influencer.delete({ where: { id } })
    await tx.coupon.deleteMany({ where: { code: current.code } })
    return current
  })
}
