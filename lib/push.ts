import webpush from 'web-push'
import { db } from '@/lib/prisma'

const STAFF_PREFIX = 'push.subscription.'
const CUSTOMER_PREFIX = 'push.customer.subscription.'

type PushSubscriptionRecord = { userId?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string } }

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

function subscriptionKey(endpoint: string, prefix: string) { return prefix + Buffer.from(endpoint).toString('base64url').slice(0, 180) }

async function getSubscriptions(prefix: string, customers: boolean) {
  const settings = await db.setting.findMany({ where: { key: { startsWith: prefix } }, select: { id: true, value: true } })
  const users = await db.user.findMany({ where: customers ? { isActive: true, role: 'CUSTOMER' } : { isActive: true, role: { not: 'CUSTOMER' } }, select: { id: true } })
  const userIds = new Set(users.map(user => user.id))
  return settings.flatMap(setting => {
    try {
      const saved = JSON.parse(setting.value) as PushSubscriptionRecord
      if (!saved.userId || !userIds.has(saved.userId) || !saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) return []
      return [{ settingId: setting.id, ...saved }]
    } catch { return [] }
  })
}

async function getStaffSubscriptions() { return getSubscriptions(STAFF_PREFIX, false) }
async function getCustomerSubscriptions() { return getSubscriptions(CUSTOMER_PREFIX, true) }

export async function hasPushSubscription(userId: string, endpoint?: string) {
  const subscriptions = await getStaffSubscriptions()
  return subscriptions.some(subscription => subscription.userId === userId && (!endpoint || subscription.endpoint === endpoint))
}

export async function hasCustomerPushSubscription(userId: string, endpoint?: string) {
  const subscriptions = await getCustomerSubscriptions()
  return subscriptions.some(subscription => subscription.userId === userId && (!endpoint || subscription.endpoint === endpoint))
}

async function sendToSubscriptions(payload: Record<string, unknown>, onlyUserId?: string, source: 'staff' | 'customer' = 'staff', allowedUserIds?: string[]) {
  if (!configure()) return { sent: 0, skipped: true, failed: 0 }
  const subscriptions = source === 'customer' ? await getCustomerSubscriptions() : await getStaffSubscriptions()
  const allowed = allowedUserIds?.length ? new Set(allowedUserIds) : null
  const targets = subscriptions.filter(s => (!onlyUserId || s.userId === onlyUserId) && (!allowed || allowed.has(s.userId!)))
  let sent = 0; let failed = 0
  await Promise.all(targets.map(async saved => {
    try {
      await webpush.sendNotification({ endpoint: saved.endpoint!, keys: { p256dh: saved.keys!.p256dh!, auth: saved.keys!.auth! } }, JSON.stringify(payload), { TTL: source === 'customer' ? 86400 : 300, urgency: source === 'customer' ? 'normal' : 'high' })
      sent += 1
    } catch (error: any) {
      failed += 1
      const statusCode = Number(error?.statusCode || error?.status || 0)
      if (statusCode === 404 || statusCode === 410) await db.setting.delete({ where: { id: saved.settingId } }).catch(() => undefined)
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
export async function saveCustomerPushSubscription(userId: string, subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) { return saveSubscription(userId, subscription, CUSTOMER_PREFIX) }
export async function removePushSubscription(endpoint: string) { await db.setting.deleteMany({ where: { key: subscriptionKey(endpoint, STAFF_PREFIX) } }) }
export async function removeCustomerPushSubscription(endpoint: string) { await db.setting.deleteMany({ where: { key: subscriptionKey(endpoint, CUSTOMER_PREFIX) } }) }

export async function sendTestPush(userId: string) {
  return sendToSubscriptions({ title: 'Order alerts test', body: 'Push notifications are working on this device.', url: '/admin/orders', test: true }, userId)
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

export async function sendNewReviewAlert(review: { id: string; productName: string; rating: number }) {
  const setting = await db.setting.findUnique({ where: { key: 'notifications.reviews' } })
  if (setting?.value === 'false') return { sent: 0, skipped: true, failed: 0 }
  return sendToSubscriptions({ title: 'New review submitted', body: `${review.productName} · ${review.rating}★ rating awaiting moderation`, url: '/admin/reviews', reviewId: review.id })
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
