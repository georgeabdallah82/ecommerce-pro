import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'
import { computeProfit, readCostSetting, reportRange } from '@/lib/profit'
import { expensesInRange } from '@/lib/expenses'

const REFUNDED = new Set(['refunded', 'partially_refunded'])

// Reports > Profit (components/profit-report.tsx). Read-only: one query per table, run only
// when the owner opens the tab, so it adds nothing to the database's idle hours.
export async function GET(req: Request) {
  try {
    const actor = await requirePermission('reports.view')
    const range = reportRange(new URL(req.url).searchParams, new Date())
    const [orders, settings, adSpend, currency, expenseRows] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: range.since, lt: range.until } },
        select: { status: true, paymentStatus: true, paymentMethod: true, currency: true, grandTotal: true, taxTotal: true, shippingTotal: true, discountTotal: true, items: { select: { productId: true, name: true, quantity: true, totalPrice: true } }, paymentTransactions: { select: { status: true, amount: true } } },
        take: 20000,
      }),
      db.setting.findMany({ where: { key: { in: ['profit.deliveryCostPerOrder', 'profit.packagingCostPerOrder'] } } }),
      db.adSpend.findMany({ where: { date: { gte: range.since, lt: range.until } }, orderBy: [{ date: 'desc' }, { platform: 'asc' }], take: 2000 }),
      getStoreCurrency(),
      db.expense.findMany({ orderBy: [{ monthly: 'desc' }, { startsOn: 'desc' }], take: 500 }),
    ])
    const productIds = [...new Set(orders.flatMap(o => o.items.map(i => i.productId)))]
    const costRows = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true } }) : []
    const setting = (key: string) => settings.find(s => s.key === key)?.value
    const report = computeProfit(
      orders.map(o => ({ ...o, refunded: o.paymentTransactions.filter(t => REFUNDED.has(t.status)).reduce((sum, t) => sum + t.amount, 0) })),
      new Map(costRows.map(p => [p.id, p.costPrice])),
      { deliveryCostPerOrder: readCostSetting(setting('profit.deliveryCostPerOrder')), packagingCostPerOrder: readCostSetting(setting('profit.packagingCostPerOrder')) },
      adSpend,
      currency,
      expensesInRange(expenseRows, range.since, range.until, currency),
    )
    return json({
      range: { since: range.since.toISOString(), until: range.until.toISOString(), days: range.days },
      report,
      expenseList: expenseRows.map(e => ({ id: e.id, name: e.name, amount: e.amount, currency: e.currency, monthly: e.monthly, startsOn: e.startsOn.toISOString().slice(0, 10), endsOn: e.endsOn ? e.endsOn.toISOString().slice(0, 10) : null })),
      adSpend: adSpend.map(a => ({ id: a.id, date: a.date.toISOString().slice(0, 10), platform: a.platform, amount: a.amount, currency: a.currency, note: a.note })),
      canEdit: hasPermission(actor, 'settings.manage'),
      truncated: orders.length >= 20000,
    })
  } catch (e) { return routeError(e, 'Forbidden', 403) }
}
