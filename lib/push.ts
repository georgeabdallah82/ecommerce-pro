import webpush from 'web-push'
import { db } from '@/lib/prisma'

const PREFIX = 'push.subscription.'

type PushSubscriptionRecord = {
  userId?: string
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

function configure() {
  // Accept the public key under either name so Render configuration cannot
  // silently break server-side push while the browser still has the key.
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

function subscriptionKey(endpoint: string) {
  return PREFIX + Buffer.from(endpoint).toString('base64url').slice(0, 180)
}

async function getStaffSubscriptions() {
  const settings = await db.setting.findMany({ where: { key: { startsWith: PREFIX } }, select: { id: true, value: true } })
  const staff = await db.user.findMany({ where: { isActive: true, role: { not: 'CUSTOMER' } }, select: { id: true } })
  const staffIds = new Set(staff.map(s => s.id))
  return settings.flatMap(setting => {
    try {
      const saved = JSON.parse(setting.value) as PushSubscriptionRecord
      if (!saved.userId || !staffIds.has(saved.userId) || !saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) return []
      return [{ settingId: setting.id, ...saved }]
    } catch {
      return []
    }
  })
}

async function sendToSubscriptions(payload: Record<string, unknown>, onlyUserId?: string) {
  if (!configure()) return { sent: 0, skipped: true, failed: 0 }

  const subscriptions = await getStaffSubscriptions()
  const targets = onlyUserId ? subscriptions.filter(s => s.userId === onlyUserId) : subscriptions
  let sent = 0
  let failed = 0

  await Promise.all(targets.map(async saved => {
    try {
      await webpush.sendNotification(
        { endpoint: saved.endpoint!, keys: { p256dh: saved.keys!.p256dh!, auth: saved.keys!.auth! } },
        JSON.stringify(payload),
        { TTL: 300, urgency: 'high' },
      )
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

export async function savePushSubscription(userId: string, subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) {
  const endpoint = String(subscription.endpoint || '').trim()
  const p256dh = String(subscription.keys?.p256dh || '').trim()
  const auth = String(subscription.keys?.auth || '').trim()
  if (!endpoint || !p256dh || !auth) throw new Error('Invalid push subscription')
  if (!/^https:\/\//i.test(endpoint)) throw new Error('Invalid push endpoint')

  await db.setting.upsert({
    where: { key: subscriptionKey(endpoint) },
    update: { value: JSON.stringify({ userId, endpoint, keys: { p256dh, auth } }) },
    create: { key: subscriptionKey(endpoint), value: JSON.stringify({ userId, endpoint, keys: { p256dh, auth } }) },
  })
}

export async function removePushSubscription(endpoint: string) {
  const key = subscriptionKey(endpoint)
  await db.setting.deleteMany({ where: { key } })
}

export async function sendTestPush(userId: string) {
  return sendToSubscriptions({
    title: 'Order alerts test',
    body: 'Push notifications are working on this device.',
    url: '/admin/orders',
    test: true,
  }, userId)
}

export async function sendNewOrderPush(order: { id: string; orderNumber: string; grandTotal: number; currency: string }) {
  return sendToSubscriptions({
    title: 'New order received',
    body: `Order #${order.orderNumber} · ${(order.grandTotal / 100).toFixed(2)} ${order.currency}`,
    url: `/admin/orders/${order.id}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
  })
}
