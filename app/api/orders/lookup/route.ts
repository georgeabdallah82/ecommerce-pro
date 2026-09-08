import { db } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'

export async function POST(request: Request) {
  const ip = clientIp(request.headers)
  const limit = consumeRateLimit(`order-lookup:ip:${ip}`, 10, 15 * 60 * 1000)
  if (!limit.allowed) {
    return json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })
  }

  const body = await request.json().catch(() => null)
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().slice(0, 60) : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  if (!orderNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid order number and email.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const order = await db.order.findUnique({ where: { orderNumber }, select: { orderNumber: true, email: true } })
  if (!order || order.email.trim().toLowerCase() !== email) {
    return json({ error: 'We could not find an order matching that order number and email.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return json({ ok: true, orderNumber: order.orderNumber }, { headers: { 'Cache-Control': 'no-store' } })
}
