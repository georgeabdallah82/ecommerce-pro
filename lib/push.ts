import webpush from 'web-push'
import { db } from '@/lib/prisma'
import { parsePushSubscription } from '@/lib/push-opt-in'

// Staff devices (order, review and low-stock alerts) are Setting rows keyed by endpoint.
// Customer devices (push campaigns) are PushSubscription rows: from the storefront popup or
// Account > Notifications, signed in or not.
const STAFF_PREFIX = 'push.subscription.'

type PushSubscriptionRecord = { userId?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string } }
type Target = { userId: string | null; endpoint: string; keys: { p256dh: string; auth: string }; remove: () => Promise<unknown> }

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

function subscriptionKey(endpoint: string, prefix: string) { return prefix + Buffer.from(endpoint).toString('base64url').slice(0, 180) }

async function getStaffSubscriptions(): Promise<Target[]> {
  const settings = await db.setting.findMany({ where: { key: { startsWith: STAFF_PREFIX } }, select: { id: true, value: true } })
  const users = await db.user.findMany({ where: { isActive: true, role: { not: 'CUSTOMER' } }, select: { id: true } })
  const userIds = new Set(users.map(user => user.id))
  return settings.flatMap(setting => {
    try {
      const saved = JSON.parse(setting.value) as PushSubscriptionRecord
      if (!saved.userId || !userIds.has(saved.userId) || !saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) return []
      return [{ userId: saved.userId, endpoint: saved.endpoint, keys: { p256dh: saved.keys.p256dh, auth: saved.keys.auth }, remove: () => db.setting.delete({ where: { id: setting.id } }) }]
    } catch { return [] }
  })
}

// Everyone who said yes on the storefront. Guests (no account) are included; a device linked to
// an account counts only while that account is an active customer (a deactivated customer's
// device gets nothing).
async function getCustomerSubscriptions(): Promise<Target[]> {
  const rows = await db.pushSubscription.findMany({ select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true } })
  const linked = [...new Set(rows.map(row => row.userId).filter((id): id is string => !!id))]
  const active = new Set(linked.length ? (await db.user.findMany({ where: { id: { in: linked }, isActive: true, role: 'CUSTOMER' }, select: { id: true } })).map(user => user.id) : [])
  return rows
    .filter(row => !row.userId || active.has(row.userId))
    .map(row => ({ userId: row.userId, endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth }, remove: () => db.pushSubscription.delete({ where: { id: row.id } }) }))
}

export async function hasPushSubscription(userId: string, endpoint?: string) {
  const subscriptions = await getStaffSubscriptions()
  return subscriptions.some(subscription => subscription.userId === userId && (!endpoint || subscription.endpoint === endpoint))
}

export async function hasCustomerPushSubscription(userId: string, endpoint?: string) {
  return (await db.pushSubscription.count({ where: { userId, ...(endpoint ? { endpoint } : {}) } })) > 0
}

// How many devices a push campaign reaches right now (Push campaigns page).
export async function countCustomerPushSubscriptions() {
  return (await getCustomerSubscriptions()).length
}

async function sendToSubscriptions(payload: Record<string, unknown>, onlyUserId?: string, source: 'staff' | 'customer' = 'staff', allowedUserIds?: string[], onlyEndpoint?: string) {
  if (!configure()) return { sent: 0, skipped: true, failed: 0 }
  const subscriptions = source === 'customer' ? await getCustomerSubscriptions() : await getStaffSubscriptions()
  const allowed = allowedUserIds?.length ? new Set(allowedUserIds) : null
  const targets = subscriptions.filter(s => (!onlyUserId || s.userId === onlyUserId) && (!onlyEndpoint || s.endpoint === onlyEndpoint) && (!allowed || (!!s.userId && allowed.has(s.userId))))
  let sent = 0; let failed = 0
  await Promise.all(targets.map(async saved => {
    try {
      await webpush.sendNotification({ endpoint: saved.endpoint, keys: saved.keys }, JSON.stringify(payload), { TTL: source === 'customer' ? 86400 : 300, urgency: source === 'customer' ? 'normal' : 'high' })
      sent += 1
    } catch (error: any) {
      failed += 1
      const statusCode = Number(error?.statusCode || error?.status || 0)
      // The browser unsubscribed or the device is gone: forget it.
      if (statusCode === 404 || statusCode === 410) await saved.remove().catch(() => undefined)
      console.error('[push] send failed', { statusCode, message: error?.message || String(error) })
    }
  }))
  return { sent, skipped: false, failed }
}

async function saveSubscription(userId: string, subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }, prefix: string) {
  const endpoint = String(subscription.endpoint || '').trim()
  const p256dh = String(subscription.keys?.p256dh || '').trim()
  const auth = String(subscription.keys?.auth || '').trim()
  if (!endpoint || !p256dh || !auth) throw new Error('Invalid push subscription')
  if (!/^https:\/\//i.test(endpoint)) throw new Error('Invalid push endpoint')
  const value = JSON.stringify({ userId, endpoint, keys: { p256dh, auth } })
  await db.setting.upsert({ where: { key: subscriptionKey(endpoint, prefix) }, update: { value }, create: { key: subscriptionKey(endpoint, prefix), value } })
}

export async function savePushSubscription(userId: string, subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) { return saveSubscription(userId, subscription, STAFF_PREFIX) }

// A customer device, from the storefront popup or Account > Notifications. userId links it to a
// signed-in customer; a guest's device has none (and keeps an earlier link if it had one).
export async function saveCustomerPushSubscription(userId: string | null, subscription: unknown) {
  const { endpoint, p256dh, auth } = parsePushSubscription(subscription)
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth, ...(userId ? { userId } : {}) },
    create: { endpoint, p256dh, auth, userId },
  })
}

// Every read path here (hasPushSubscription/hasCustomerPushSubscription) filters by the
// caller's own userId -- subscriptionKey has no userId component (it's derived from the
// endpoint alone), so the delete path has to look the row up and check ownership itself
// instead of just deleting by key, or any signed-in user could unsubscribe anyone else's
// device by guessing/leaking their endpoint.
async function removeSubscription(userId: string, endpoint: string, prefix: string) {
  const key = subscriptionKey(endpoint, prefix)
  const setting = await db.setting.findUnique({ where: { key } })
  if (!setting) return
  let saved: PushSubscriptionRecord
  try { saved = JSON.parse(setting.value) } catch { return }
  if (saved.userId !== userId) return
  await db.setting.deleteMany({ where: { key } })
}

export async function removePushSubscription(userId: string, endpoint: string) { return removeSubscription(userId, endpoint, STAFF_PREFIX) }

// Account > Notifications "turn off" for this device: its row if it's this customer's, or a guest
// row (the same browser said yes before signing in). Another customer's device is never touched.
export async function removeCustomerPushSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpoint, OR: [{ userId }, { userId: null }] } })
}

// To the device that asked (its endpoint), so the test proves that device works, not just that
// this staff member has alerts on some device.
export async function sendTestPush(userId: string, endpoint?: string) {
  return sendToSubscriptions({ title: 'Order alerts test', body: 'Push notifications are working on this device.', url: '/admin/orders', test: true }, userId, 'staff', undefined, endpoint)
}

export async function sendNewOrderPush(order: { id: string; orderNumber: string; grandTotal: number; currency: string }) {
  const settings = await db.setting.findMany({ where: { key: { in: ['notifications.newOrder', 'notifications.orderEmail'] } }, select: { key: true, value: true } })
  const configured = Object.fromEntries(settings.map(setting => [setting.key, setting.value]))
  const enabledValue = configured['notifications.newOrder'] ?? configured['notifications.orderEmail']
  if (enabledValue === 'false') return { sent: 0, skipped: true, failed: 0 }
  return sendToSubscriptions({ title: 'New order received', body: `Order #${order.orderNumber} · ${(order.grandTotal / 100).toFixed(2)} ${order.currency}`, url: `/admin/orders/${order.id}`, orderId: order.id, orderNumber: order.orderNumber })
}

export async function sendCustomerPushCampaign(payload: { title: string; body: string; url?: string; icon?: string }, userIds?: string[]) {
  return sendToSubscriptions({ ...payload, url: payload.url || '/', marketing: true }, undefined, 'customer', userIds)
}

// One device that is on neither list: a "notify me when it's back" request (lib/back-in-stock.ts).
// 'gone' means the browser unsubscribed or no longer exists.
export async function sendPushToDevice(device: { endpoint: string; p256dh: string; auth: string }, payload: Record<string, unknown>): Promise<'sent' | 'gone' | 'failed' | 'skipped'> {
  if (!configure()) return 'skipped'
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: 'normal' })
    return 'sent'
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.status || 0)
    if (statusCode === 404 || statusCode === 410) return 'gone'
    console.error('[push] send failed', { statusCode, message: error?.message || String(error) })
    return 'failed'
  }
}

export async function sendNewReviewAlert(review: { id: string; productName: string; rating: number }) {
  const setting = await db.setting.findUnique({ where: { key: 'notifications.reviews' } })
  if (setting?.value === 'false') return { sent: 0, skipped: true, failed: 0 }
  return sendToSubscriptions({ title: 'New review submitted', body: `${review.productName} · ${review.rating}★ rating awaiting moderation`, url: '/admin/reviews', reviewId: review.id })
}

// A driver marked an order delivered or reported a problem on their own page (lib/drivers.ts).
// Uses the new-order alerts switch, as both are about orders on the way.
export async function sendDriverUpdatePush(update: { title: string; body: string; orderId: string }) {
  const settings = await db.setting.findMany({ where: { key: { in: ['notifications.newOrder', 'notifications.orderEmail'] } }, select: { key: true, value: true } })
  const configured = Object.fromEntries(settings.map(setting => [setting.key, setting.value]))
  if ((configured['notifications.newOrder'] ?? configured['notifications.orderEmail']) === 'false') return { sent: 0, skipped: true, failed: 0 }
  return sendToSubscriptions({ title: update.title, body: update.body, url: `/admin/orders/${update.orderId}`, orderId: update.orderId })
}

// A shopper asked about a product (app/api/questions): staff answer it in Admin > Questions. Uses
// the review alerts switch (Settings > Notifications), as both wait for the owner.
export async function sendNewQuestionAlert(question: { id: string; productName: string }) {
  const setting = await db.setting.findUnique({ where: { key: 'notifications.reviews' } })
  if (setting?.value === 'false') return { sent: 0, skipped: true, failed: 0 }
  return sendToSubscriptions({ title: 'New question', body: `About ${question.productName}: waiting for your answer`, url: '/admin/questions' })
}

// Called with the inventory item ids touched by a stock-reducing action (a manual adjustment,
// an order fulfillment) to alert staff about any that are now at or below their threshold.
// Re-reads current state rather than trusting the caller's snapshot, same reasoning as
// dispatchInventoryUpdated in lib/webhooks.ts. Fires on every qualifying change rather than
// only the first crossing -- simple and stateless, matching every other push helper here, at
// the cost of a repeat alert if stock stays low across multiple further adjustments.
export async function checkLowStockAlerts(inventoryIds: Iterable<string>) {
  const ids = [...new Set(inventoryIds)]
  if (!ids.length) return { sent: 0, skipped: true, failed: 0 }
  const setting = await db.setting.findUnique({ where: { key: 'notifications.lowStock' } })
  if (setting?.value === 'false') return { sent: 0, skipped: true, failed: 0 }

  const items = await db.inventoryItem.findMany({
    where: { id: { in: ids } },
    include: { product: { select: { name: true } }, variant: { select: { name: true } } },
  })
  const low = items.filter(item => item.lowStockThreshold > 0 && item.quantity - item.reserved <= item.lowStockThreshold)
  if (!low.length) return { sent: 0, skipped: true, failed: 0 }

  const names = low.map(item => item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name)
  const body = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
  return sendToSubscriptions({ title: `Low stock: ${low.length} item${low.length === 1 ? '' : 's'}`, body, url: '/admin/inventory', lowStock: true })
}

// The owner's morning summary on the phone (lib/daily-summary.ts), to staff who turned
// notifications on.
export async function sendDailySummaryPush(payload: { title: string; body: string }) {
  return sendToSubscriptions({ ...payload, url: '/admin', dailySummary: true })
}
