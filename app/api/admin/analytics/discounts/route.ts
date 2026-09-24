import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

function clampDays(value: string | null, fallback: number) {
  const n = Number(value || fallback)
  return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.floor(n))) : fallback
}

function parseDateParam(value: string | null) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

// order.discountTotal bundles the coupon discount together with any coin/gift-card
// reward redeemed in the same checkout (see app/api/checkout/route.ts's
// `discountTotal: discount.total + coinDiscount + giftCardDiscount`), so attributing
// the whole column to the coupon overstates it. The reward portion, when present, is
// recorded inline on the checkout PaymentTransaction's rawJson -- subtract it back out.
function parseRewardDiscount(rawJson: string | null | undefined) {
  if (!rawJson) return 0
  try {
    const parsed = JSON.parse(rawJson) as { coinDiscount?: unknown; giftCardAmount?: unknown }
    const coinDiscount = Number.isSafeInteger(parsed.coinDiscount) ? Math.max(0, Number(parsed.coinDiscount)) : 0
    const giftCardAmount = Number.isSafeInteger(parsed.giftCardAmount) ? Math.max(0, Number(parsed.giftCardAmount)) : 0
    return coinDiscount + giftCardAmount
  } catch {
    return 0
  }
}

// Mirrors netRevenueForOrder in ../route.ts -- the main dashboard already nets refunded/
// partially_refunded PaymentTransaction amounts out of revenue (task #134, "Total Spent
// counting refunded orders"), but this sibling report was never given the same treatment, so
// a coupon whose orders were later fully refunded still showed as having driven that revenue.
function netRevenueForOrder(order: { grandTotal: number; paymentTransactions: { status: string; amount: number }[] }) {
  const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
  return Math.max(0, order.grandTotal - refunded)
}

/** Mirrors the day-count resolution in ../route.ts so this report scopes to the same period the dashboard shows. */
function resolveRange(searchParams: URLSearchParams, now: Date) {
  const startParam = parseDateParam(searchParams.get('start'))
  const endParam = parseDateParam(searchParams.get('end'))
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrowStart = new Date(todayStart.getTime() + 86400000)
  if (startParam && endParam && endParam >= startParam) {
    return { since: startParam, until: new Date(Math.min(endParam.getTime() + 86400000, tomorrowStart.getTime())) }
  }
  const days = clampDays(searchParams.get('days'), 30)
  return { since: new Date(todayStart.getTime() - (days - 1) * 86400000), until: tomorrowStart }
}

export async function GET(req: Request) {
  try {
    await requirePermission('reports.view')
    const { searchParams } = new URL(req.url)
    const { since, until } = resolveRange(searchParams, new Date())

    const orders = await db.order.findMany({
      where: { createdAt: { gte: since, lt: until }, status: { not: OrderStatus.CANCELLED }, couponCode: { not: null } },
      select: {
        couponCode: true,
        discountTotal: true,
        grandTotal: true,
        paymentTransactions: { select: { provider: true, status: true, amount: true, rawJson: true } },
      },
    })

    const byCode = new Map<string, { code: string; timesUsed: number; discountGiven: number; revenue: number }>()
    for (const o of orders) {
      if (!o.couponCode) continue
      const checkoutTx = o.paymentTransactions.find(t => t.provider === 'checkout')
      const rewardDiscount = parseRewardDiscount(checkoutTx?.rawJson)
      const couponDiscount = Math.max(0, (o.discountTotal || 0) - rewardDiscount)
      const existing = byCode.get(o.couponCode) || { code: o.couponCode, timesUsed: 0, discountGiven: 0, revenue: 0 }
      existing.timesUsed += 1
      existing.discountGiven += couponDiscount
      existing.revenue += netRevenueForOrder(o)
      byCode.set(o.couponCode, existing)
    }

    const codes = [...byCode.keys()]
    const coupons = codes.length ? await db.coupon.findMany({ where: { code: { in: codes } } }) : []
    const couponByCode = new Map(coupons.map((c: any) => [c.code, c]))

    const rows = Array.from(byCode.values())
      .map(row => {
        const coupon = couponByCode.get(row.code)
        return { ...row, type: coupon?.type ?? null, isAutomatic: coupon?.isAutomatic ?? false, isActive: coupon?.isActive ?? null }
      })
      .sort((a, b) => b.discountGiven - a.discountGiven)

    return json({
      range: { since: since.toISOString(), until: until.toISOString() },
      rows,
      totals: {
        timesUsed: rows.reduce((s, r) => s + r.timesUsed, 0),
        discountGiven: rows.reduce((s, r) => s + r.discountGiven, 0),
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[admin/analytics/discounts] unexpected failure', error)
    return json({ error: 'Unable to load discount performance' }, { status: 500 })
  }
}
