import { OrderStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { config, money } from '@/lib/config'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { getStoreIdentity } from '@/lib/store-identity'
import { sendWeeklyReportEmail } from '@/lib/email'
import { internationalPhone } from '@/lib/phone'
import { storeDayKey } from '@/lib/daily-summary'
import { WEEKLY_REPORT_KEY, WEEKLY_REPORT_LAST, change, isMonday, weekLabel, weekRanges, weeklyFacts } from '@/lib/weekly-report'

// The weekly report (lib/weekly-report.ts): on Monday mornings, about the week that just ended.
export async function sendWeeklyReport(now: Date) {
  if ((await db.setting.findUnique({ where: { key: WEEKLY_REPORT_KEY } }))?.value === 'false') return { sent: false, note: 'Turned off in Settings' }
  const timezone = await getStoreTimezone()
  const today = storeDayKey(now, timezone)
  if (!isMonday(today)) return { sent: false, note: 'Not Monday' }
  const last = await db.setting.findUnique({ where: { key: WEEKLY_REPORT_LAST } })
  if (last?.value === today) return { sent: false, note: 'Already sent this week' }
  await db.setting.upsert({ where: { key: WEEKLY_REPORT_LAST }, update: { value: today }, create: { key: WEEKLY_REPORT_LAST, value: today } })

  const { week } = weekRanges(today)
  const since = new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000)
  const [recent, older, currency, store, recipients, cash, stock, ads] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true, grandTotal: true, phone: true, shippingAddressJson: true, items: { select: { name: true, quantity: true, unitPrice: true } } }, take: 5000 }),
    db.order.findMany({ where: { createdAt: { lt: since }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, phone: { not: null } }, select: { phone: true }, take: 50000 }),
    getStoreCurrency(),
    getStoreIdentity(),
    db.setting.findMany({ where: { key: { in: ['notifications.summaryEmail', 'contact.email'] } }, select: { key: true, value: true } }),
    db.order.aggregate({ where: { cashCollected: { gt: 0 }, cashSettledAt: null }, _sum: { cashCollected: true } }),
    db.inventoryItem.findMany({ where: { lowStockThreshold: { gt: 0 }, product: { status: 'ACTIVE' } }, select: { quantity: true, reserved: true, lowStockThreshold: true }, take: 5000 }),
    db.adSpend.aggregate({ where: { date: { gte: new Date(`${week.from}T00:00:00Z`), lte: new Date(`${week.to}T00:00:00Z`) } }, _sum: { amount: true } }),
  ])
  const area = (json: string | null) => { try { const a = JSON.parse(json || '{}') || {}; return String(a.region || a.city || '').trim() } catch { return '' } }
  const orders = recent.map(o => ({ dayKey: storeDayKey(o.createdAt, timezone), status: o.status, grandTotal: o.grandTotal, phone: o.phone, area: area(o.shippingAddressJson), items: o.items }))
  // Customers who had ordered before the week started (cancelled orders don't count).
  const earlier = new Set([
    ...older.map(o => internationalPhone(o.phone, store.country)),
    ...orders.filter(o => o.dayKey < week.from && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REFUNDED).map(o => internationalPhone(o.phone, store.country)),
  ].filter(Boolean))
  const facts = weeklyFacts(orders, today, earlier, store.country)
  const map = new Map(recipients.map(r => [r.key, r.value.trim()]))
  const to = map.get('notifications.summaryEmail') || map.get('contact.email') || config.supportEmail
  if (!to) return { sent: false, note: 'No email address for the report' }
  const label = weekLabel(facts.from, facts.to)
  const email = await sendWeeklyReportEmail(to, {
    subject: `${store.name ? `${store.name}: ` : ''}your week, ${facts.orders} order${facts.orders === 1 ? '' : 's'} · ${money(facts.sales, currency)}`,
    weekLabel: label, currency, facts,
    ordersChange: change(facts.orders, facts.previousOrders), salesChange: change(facts.sales, facts.previousSales),
    cashWithDrivers: cash._sum.cashCollected || 0,
    lowStock: stock.filter(i => i.quantity - i.reserved <= i.lowStockThreshold).length,
    adSpend: ads._sum.amount || 0,
  })
  return { sent: !!email.sent, note: '' }
}
