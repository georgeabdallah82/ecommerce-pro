import webpush from 'web-push'
import { db } from '@/lib/prisma'

const PREFIX = 'push.subscription.'

function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

function subscriptionKey(endpoint: string) {
  return PREFIX + Buffer.from(endpoint).toString('base64url').slice(0, 180)
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

export async function sendNewOrderPush(order: { id: string; orderNumber: string; grandTotal: number; currency: string }) {
  if (!configure()) return { sent: 0, skipped: true }

  const settings = await db.setting.findMany({ where: { key: { startsWith: PREFIX } }, select: { id: true, key: true, value: true } })
  if (!settings.length) return { sent: 0, skipped: false }

  const staff = await db.user.findMany({ where: { isActive: true, role: { not: 'CUSTOMER' } }, select: { id: true } })
  const staffIds = new Set(staff.map(s => s.id))
  let sent = 0

  await Promise.all(settings.map(async setting => {
    try {
      const saved = JSON.parse(setting.value) as { userId?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!saved.userId || !staffIds.has(saved.userId) || !saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) return

      await webpush.sendNotification(
        { endpoint: saved.endpoint, keys: { p256dh: saved.keys.p256dh, auth: saved.keys.auth } },
        JSON.stringify({
          title: 'New order received',
          body: `Order #${order.orderNumber} · ${(order.grandTotal / 100).toFixed(2)} ${order.currency}`,
          url: `/admin/orders/${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
        }),
        { TTL: 60, urgency: 'high' },
      )
      sent += 1
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0)
      if (statusCode === 404 || statusCode === 410) await db.setting.delete({ where: { id: setting.id } }).catch(() => undefined)
    }
  }))

  return { sent, skipped: false }
}
