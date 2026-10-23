import { OrderStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { config, money } from '@/lib/config'
import { isInternalJobRequest } from '@/lib/internal-job'
import { configuredSiteUrl } from '@/lib/site-url'
import { orderReviewPath } from '@/lib/order-access'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { getStoreIdentity } from '@/lib/store-identity'
import { isOptedOut } from '@/lib/cart-reminders'
import { sendDailySummaryEmail, sendReviewRequestEmail } from '@/lib/email'
import { sendWeeklyReport } from '@/lib/weekly-report-job'
import { sendDailySummaryPush } from '@/lib/push'
import { armOrderWatch } from '@/lib/order-watch-storage'
import { pruneVisitorData } from '@/lib/visitors'
import { REVIEW_REQUESTS_PER_DAY, REVIEW_REQUEST_MARK, dailySummaryMessage, dayLabel, reviewRequestWindow, storeDayKey, yesterdayKey } from '@/lib/daily-summary'
import { loadDatabaseHoursAdvice } from '@/lib/database-hours-server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const SUMMARY_LAST_SENT = 'notifications.dailySummaryLast'

async function settingOn(key: string) {
  return (await db.setting.findUnique({ where: { key } }))?.value !== 'false'
}

// "How was your order?" emails for orders delivered about a day ago (lib/daily-summary.ts).
async function sendReviewRequests(now: Date, site: string) {
  const result = { sent: 0, skipped: 0, failed: 0, note: '' }
  if (!(await settingOn('email.reviewRequest'))) return { ...result, note: 'Turned off in Settings' }
  if (!site) return { ...result, note: 'No site address configured' }
  const { deliveredAfter, deliveredBefore } = reviewRequestWindow(now)
  const orders = await db.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      email: { contains: '@' },
      events: { some: { status: OrderStatus.DELIVERED, createdAt: { gte: deliveredAfter, lte: deliveredBefore } }, none: { message: { startsWith: 'Review request' } } },
      reviews: { none: {} },
    },
    select: {
      id: true, orderNumber: true, email: true, shippingAddressJson: true,
      items: { select: { product: { select: { id: true, name: true, status: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } } } },
    },
    orderBy: { createdAt: 'asc' },
    take: REVIEW_REQUESTS_PER_DAY,
  })
  for (const order of orders) {
    if (await isOptedOut(order.email)) {
      await db.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.DELIVERED, message: 'Review request not sent: the customer unsubscribed from emails.' } })
      result.skipped += 1
      continue
    }
    const seen = new Set<string>()
    const products = order.items.flatMap(({ product: p }) => {
      if (!p || p.status !== 'ACTIVE' || seen.has(p.id)) return []
      seen.add(p.id)
      const image = p.images[0]?.url || ''
      return [{ name: p.name, image: image.startsWith('/') ? `${site}${image}` : image }]
    })
    if (!products.length) { result.skipped += 1; continue }
    let firstName = ''
    try { firstName = String(JSON.parse(order.shippingAddressJson || '{}')?.firstName || '').trim() } catch {}
    // Marked first, so an overlapping run can't email the same customer twice; the mark is
    // removed again if the email could not go out, so tomorrow's run tries again.
    const mark = await db.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.DELIVERED, message: REVIEW_REQUEST_MARK } })
    const sent = await sendReviewRequestEmail({ email: order.email, orderNumber: order.orderNumber, firstName, products }, `${site}${orderReviewPath(order.orderNumber)}`)
    if (sent.sent) { result.sent += 1; continue }
    await db.orderEvent.delete({ where: { id: mark.id } }).catch(() => undefined)
    if (sent.skipped) result.skipped += 1
    else result.failed += 1
  }
  return result
}

// The owner's morning summary: email and phone notification, once a day.
async function sendSummary(now: Date, reviewEmailsSent: number) {
  if (!(await settingOn('notifications.dailySummary'))) return { sent: false, pushed: 0, note: 'Turned off in Settings' }
  const timezone = await getStoreTimezone()
  const today = storeDayKey(now, timezone)
  const last = await db.setting.findUnique({ where: { key: SUMMARY_LAST_SENT } })
  if (last?.value === today) return { sent: false, pushed: 0, note: 'Already sent today' }
  await db.setting.upsert({ where: { key: SUMMARY_LAST_SENT }, update: { value: today }, create: { key: SUMMARY_LAST_SENT, value: today } })

  const yesterday = yesterdayKey(now, timezone)
  const [currency, store, recent, counts, stock, pendingReviews, recipients, unfinished, hoursAdvice] = await Promise.all([
    getStoreCurrency(),
    getStoreIdentity(),
    db.order.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 50 * 60 * 60 * 1000) }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } }, select: { createdAt: true, grandTotal: true } }),
    db.order.groupBy({ by: ['status'], where: { status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED] } }, _count: { _all: true } }),
    db.inventoryItem.findMany({ where: { lowStockThreshold: { gt: 0 }, product: { status: 'ACTIVE' } }, select: { quantity: true, reserved: true, lowStockThreshold: true, product: { select: { name: true } }, variant: { select: { name: true } } }, take: 5000 }),
    db.review.count({ where: { approved: false } }),
    db.setting.findMany({ where: { key: { in: ['notifications.summaryEmail', 'contact.email'] } }, select: { key: true, value: true } }),
    db.abandonedCheckout.count({ where: { status: 'OPEN', whatsappAt: null, lastActivity: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) }, OR: [{ phone: { not: null } }, { email: { not: null } }] } }).catch(() => 0),
    loadDatabaseHoursAdvice(),
  ])
  const count = (status: OrderStatus) => counts.find(c => c.status === status)?._count._all || 0
  const placed = recent.filter(o => storeDayKey(o.createdAt, timezone) === yesterday)
  const lowStock = stock
    .filter(i => i.quantity - i.reserved <= i.lowStockThreshold)
    .map(i => ({ name: i.variant && i.variant.name !== 'Default Title' ? `${i.product.name} (${i.variant.name})` : i.product.name, left: Math.max(0, i.quantity - i.reserved) }))
    .sort((a, b) => a.left - b.left)
  const facts = {
    storeName: store.name,
    dayLabel: dayLabel(now, timezone),
    currency,
    ordersYesterday: placed.length,
    salesYesterday: placed.reduce((sum, o) => sum + o.grandTotal, 0),
    toConfirm: count(OrderStatus.PENDING),
    toPrepare: count(OrderStatus.CONFIRMED) + count(OrderStatus.PROCESSING),
    outForDelivery: count(OrderStatus.SHIPPED),
    lowStock,
    pendingReviews,
    reviewEmailsSent,
    unfinished,
    // Only when the free hours need attention; "fine" and "unknown" add nothing to the summary.
    databaseHours: hoursAdvice && hoursAdvice.level !== 'ok' ? hoursAdvice.short : undefined,
  }
  const message = dailySummaryMessage(facts, money)
  const map = new Map(recipients.map(r => [r.key, r.value.trim()]))
  const to = map.get('notifications.summaryEmail') || map.get('contact.email') || config.supportEmail
  const [email, push] = await Promise.all([
    to ? sendDailySummaryEmail(to, { subject: message.subject, dayLabel: facts.dayLabel, ordersYesterday: facts.ordersYesterday, sales: message.sales, waiting: message.waiting, lowStock, reviewEmailsSent }) : Promise.resolve({ sent: false, skipped: true }),
    sendDailySummaryPush(message.push).catch(error => { console.error('[daily] summary push failed', error); return { sent: 0, skipped: false, failed: 1 } }),
  ])
  return { sent: !!email.sent, pushed: push.sent, note: to ? '' : 'No email address for the summary' }
}

// Safety net for the order watch (lib/order-watch.ts): if an order is waiting for confirmation, make
// sure it is being watched, even if the marker file was lost. The database is already awake here.
async function rearmOrderWatch() {
  const waiting = await db.order.count({ where: { status: OrderStatus.PENDING, NOT: { paymentMethod: 'CARD', paymentStatus: { not: 'PAID' } } } })
  if (waiting) await armOrderWatch()
  return waiting
}

// Run once a day by the Worker's cron (worker.ts scheduled()). Each part runs on its own, so a
// problem with one doesn't stop the other.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const now = new Date()
  // Links in the emails need the shop's address; the cron's own request has none when the site
  // address isn't configured (worker.ts uses internal.invalid then).
  const origin = new URL(req.url)
  const site = configuredSiteUrl() || (origin.hostname.endsWith('.invalid') ? '' : origin.origin)
  const reviewEmails = await sendReviewRequests(now, site).catch(error => { console.error('[daily] review requests failed', error); return { sent: 0, skipped: 0, failed: 0, note: 'Error' } })
  const summary = await sendSummary(now, reviewEmails.sent).catch(error => { console.error('[daily] summary failed', error); return { sent: false, pushed: 0, note: 'Error' } })
  const weekly = await sendWeeklyReport(now).catch(error => { console.error('[daily] weekly report failed', error); return { sent: false, note: 'Error' } })
  const visitors = await pruneVisitorData(now).catch(error => { console.error('[daily] visitor cleanup failed', error); return { sessions: -1, views: -1 } })
  const waiting = await rearmOrderWatch().catch(error => { console.error('[daily] order watch failed', error); return -1 })
  console.log('[daily] done', { reviewEmails, summary, weekly, waiting, visitors })
  return json({ reviewEmails, summary, weekly, waiting }, { headers: NO_STORE })
}
