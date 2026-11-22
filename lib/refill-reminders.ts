import { createHmac, timingSafeEqual } from 'node:crypto'
import { OrderStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'
import { customerPhone, shippingAddress } from '@/lib/order-flow'
import { cartLinesFor } from '@/lib/order-again'
import { isOptedOut } from '@/lib/cart-reminders'
import { langFor } from '@/lib/message-lang'
import { sendRefillReminderEmail } from '@/lib/email'
import { sendRefillWhatsApp, whatsappCloudConfig } from '@/lib/whatsapp-cloud'

// "Running low?" reminders (docs/refill-reminders-2026-11.md). A product can say after how many days its buyers may
// need it again (product editor › Inventory: detergent after 30 days, coffee after 21). That many days after the
// order was delivered, the morning job (app/api/internal/daily) sends the customer one reminder, in their language:
// on WhatsApp when they asked for WhatsApp updates and the store has a "Running low?" template, otherwise by email.
// Its link (app/refill/[orderNumber]) puts the products back in the cart in one tap, at today's prices.
//
// Limits: one reminder per product per order; at most one a week per customer; none once they bought the product
// again, asked for no more ("Stop these reminders"), or unsubscribed from the store's reminder emails; none for a
// product that can't be bought today; none more than REFILL_LATE_DAYS late; REFILL_REMINDERS_PER_DAY a morning.
// Settings › Email & messaging › "Running low?" reminders turns them all off.

export const REFILL_SETTING = 'email.refillReminder'
export const REFILL_MIN_DAYS = 7
export const REFILL_MAX_DAYS = 365
export const REFILL_LATE_DAYS = 14
export const REFILL_GAP_DAYS = 7
export const REFILL_REMINDERS_PER_DAY = 30
const DAY = 24 * 60 * 60 * 1000
// The order page notes say what happened, as a "Note" (lib/order-flow.ts): never as "Delivered", which would make
// the order look delivered again (review requests read the delivery from its notes).
export const REFILL_NOTE_STATUS = 'NOTE'

// The product editor's box: empty for no reminder, else whole days between 7 and 365.
export function cleanRefillDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const days = Math.round(Number(value))
  if (!Number.isFinite(days) || days <= 0) return null
  return Math.min(REFILL_MAX_DAYS, Math.max(REFILL_MIN_DAYS, days))
}

// Due once its days have passed since delivery, for REFILL_LATE_DAYS more: a reminder later than that (reminders
// switched on long after the order) is not sent at all.
export function isRefillDue(deliveredAt: Date, days: number, now: Date) {
  const from = deliveredAt.getTime() + days * DAY
  return now.getTime() >= from && now.getTime() < from + REFILL_LATE_DAYS * DAY
}

function secret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return raw
}
// The reminder's link carries its own signature: it shows the products and can stop the reminders, nothing else.
export function refillToken(orderNumber: string) {
  return createHmac('sha256', secret()).update(`refill:${orderNumber}`).digest('base64url').slice(0, 32)
}
export function isValidRefillToken(orderNumber: string, token: unknown) {
  if (!orderNumber || typeof token !== 'string' || !token) return false
  try {
    const expected = Buffer.from(refillToken(orderNumber))
    const given = Buffer.from(token)
    return expected.length === given.length && timingSafeEqual(expected, given)
  } catch {
    return false
  }
}
export const refillPath = (orderNumber: string) => `/refill/${encodeURIComponent(orderNumber)}?t=${refillToken(orderNumber)}`
// The address mail apps' own "Unsubscribe" button posts to (List-Unsubscribe one-click).
export const refillStopPath = (orderNumber: string) => `/api/refill/stop?o=${encodeURIComponent(orderNumber)}&t=${refillToken(orderNumber)}`

// The customer's email address and mobile number, as "email:..." and "phone:<international digits>".
export function contactKeys(order: { email?: string | null; phone?: string | null; shippingAddressJson?: string | null }, storeCountry: string) {
  const keys: string[] = []
  const email = String(order.email || '').trim().toLowerCase()
  if (email.includes('@')) keys.push(`email:${email}`)
  const phone = internationalPhone(customerPhone({ phone: order.phone ?? null, shippingAddressJson: order.shippingAddressJson ?? '' }), storeCountry)
  if (phone) keys.push(`phone:${phone}`)
  return keys
}

export async function stopRefillReminders(keys: string[]) {
  for (const contact of keys) await db.refillOptOut.upsert({ where: { contact }, update: {}, create: { contact } })
}

export async function refillStopped(keys: string[]) {
  if (!keys.length) return false
  return !!(await db.refillOptOut.findFirst({ where: { contact: { in: keys } }, select: { id: true } }))
}

export async function storeCountry() {
  return (await db.setting.findUnique({ where: { key: 'store.country' } }))?.value || 'Lebanon'
}

type CandidateOrder = { id: string; createdAt: Date; userId: string | null; email: string; phone: string | null }

// The products the customer has ordered again since (an order that was not cancelled): no reminder needed.
async function boughtAgain(order: CandidateOrder, productIds: string[]) {
  const who = [
    ...(order.userId ? [{ userId: order.userId }] : []),
    ...(order.email.includes('@') ? [{ email: { equals: order.email, mode: 'insensitive' as const } }] : []),
    ...(order.phone ? [{ phone: order.phone }] : []),
  ]
  if (!who.length) return new Set<string>()
  const rows = await db.orderItem.findMany({
    where: { productId: { in: productIds }, order: { id: { not: order.id }, createdAt: { gt: order.createdAt }, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }, OR: who } },
    select: { productId: true },
  })
  return new Set(rows.map(r => r.productId))
}

// Rows for reminders that will not be sent ("opted_out", "bought_again", "no_contact"), so they aren't looked at again.
async function settle(orderId: string, productIds: string[], channel: string, contact: string | null) {
  for (const productId of productIds) await db.refillReminder.create({ data: { orderId, productId, channel, contact } }).catch(() => undefined)
}

// Written before the reminder goes out, one row per product: a second run at the same time gets none of them.
async function claim(orderId: string, productIds: string[], channel: string, contact: string) {
  const mine: string[] = []
  for (const productId of productIds) {
    try {
      await db.refillReminder.create({ data: { orderId, productId, channel, contact } })
      mine.push(productId)
    } catch {
      // Already claimed or handled.
    }
  }
  return mine
}

const absolute = (site: string, image: string) => (/^https:\/\//i.test(image) ? image : image.startsWith('/') ? `${site}${image}` : '')

export async function sendDueRefillReminders(now: Date, site: string) {
  const result = { sent: 0, skipped: 0, failed: 0, note: '' }
  if ((await db.setting.findUnique({ where: { key: REFILL_SETTING } }))?.value === 'false') return { ...result, note: 'Turned off in Settings' }
  if (!site) return { ...result, note: 'No site address configured' }
  const products = await db.product.findMany({ where: { refillDays: { not: null }, status: 'ACTIVE' }, select: { id: true, refillDays: true } })
  const daysOf = new Map(products.map(p => [p.id, cleanRefillDays(p.refillDays)]).filter((e): e is [string, number] => e[1] !== null))
  if (!daysOf.size) return { ...result, note: 'No product has a reminder set' }
  const longest = Math.max(...daysOf.values())
  const shortest = Math.min(...daysOf.values())
  const orders = await db.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      items: { some: { productId: { in: [...daysOf.keys()] } } },
      events: { some: { status: OrderStatus.DELIVERED, createdAt: { gte: new Date(now.getTime() - (longest + REFILL_LATE_DAYS) * DAY), lte: new Date(now.getTime() - shortest * DAY) } } },
    },
    select: {
      id: true, orderNumber: true, email: true, phone: true, userId: true, lang: true, whatsappUpdates: true, shippingAddressJson: true, createdAt: true,
      items: { select: { productId: true, variantId: true, quantity: true, unitPrice: true, name: true } },
      // The first time it reached Delivered: notes written later (a review request) must not move the day it arrived.
      events: { where: { status: OrderStatus.DELIVERED }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 300,
  })
  if (!orders.length) return result
  const handled = new Set((await db.refillReminder.findMany({ where: { orderId: { in: orders.map(o => o.id) } }, select: { orderId: true, productId: true } })).map(r => `${r.orderId}|${r.productId}`))
  const country = await storeCountry()
  const whatsapp = await whatsappCloudConfig().catch(() => null)
  const whatsappReady = !!(whatsapp?.enabled && whatsapp.connected && whatsapp.templates.refill)
  const reached = new Set<string>()

  for (const order of orders) {
    if (result.sent >= REFILL_REMINDERS_PER_DAY) { result.note = 'Daily limit reached'; break }
    const deliveredAt = order.events[0]?.createdAt
    if (!deliveredAt) continue
    const due = [...new Set(order.items.filter(i => daysOf.has(i.productId) && !handled.has(`${order.id}|${i.productId}`) && isRefillDue(deliveredAt, daysOf.get(i.productId)!, now)).map(i => i.productId))]
    if (!due.length) continue
    const keys = contactKeys(order, country)
    if (!keys.length) { await settle(order.id, due, 'no_contact', null); result.skipped += 1; continue }
    // One reminder per customer a morning, and at most one a week: the rest wait for a later morning.
    if (keys.some(k => reached.has(k))) { result.skipped += 1; continue }
    if (await db.refillReminder.findFirst({ where: { contact: { in: keys }, channel: { in: ['email', 'whatsapp'] }, createdAt: { gte: new Date(now.getTime() - REFILL_GAP_DAYS * DAY) } }, select: { id: true } })) { result.skipped += 1; continue }
    if (await refillStopped(keys)) {
      await settle(order.id, due, 'opted_out', keys[0])
      await db.orderEvent.create({ data: { orderId: order.id, status: REFILL_NOTE_STATUS, message: 'Running low? reminder not sent: the customer asked for no more reminders.' } })
      result.skipped += 1
      continue
    }
    const again = await boughtAgain(order, due)
    if (again.size) await settle(order.id, [...again], 'bought_again', keys[0])
    const remaining = due.filter(id => !again.has(id))
    if (!remaining.length) { result.skipped += 1; continue }
    // What can be bought today; a product sold out now is tried again on a later morning, while it is due.
    const lines = await cartLinesFor(order.items.filter(i => remaining.includes(i.productId)))
    if (!lines.length) { result.skipped += 1; continue }

    const phoneKey = keys.find(k => k.startsWith('phone:'))
    const emailKey = keys.find(k => k.startsWith('email:'))
    const byWhatsApp = !!(order.whatsappUpdates && phoneKey && whatsappReady)
    const byEmail = !byWhatsApp && !!emailKey && !(await isOptedOut(order.email))
    if (!byWhatsApp && !byEmail) { await settle(order.id, remaining, 'no_contact', keys[0]); result.skipped += 1; continue }
    const channel = byWhatsApp ? 'whatsapp' : 'email'
    const claimed = await claim(order.id, [...new Set(lines.map(l => l.productId))], channel, (byWhatsApp ? phoneKey : emailKey)!)
    if (!claimed.length) continue
    const items = lines.filter(l => claimed.includes(l.productId))
    const lang = await langFor(order)
    const url = `${site}${refillPath(order.orderNumber)}`
    const firstName = String(shippingAddress(order.shippingAddressJson).firstName || '').trim().split(/\s+/)[0] || ''
    let ok = false
    let skippedSend = false
    if (byWhatsApp) {
      const sent = await sendRefillWhatsApp(whatsapp!, { to: phoneKey!.slice('phone:'.length), lang, firstName, products: items.map(l => l.name), url })
      ok = sent.ok
      if (!ok) console.error('[refill] WhatsApp reminder failed', order.orderNumber, sent.error)
    } else {
      const sent = await sendRefillReminderEmail(order.email, { firstName, products: items.map(l => ({ name: l.name, image: absolute(site, l.image || '') })), url, stopUrl: `${url}&stop=1`, oneClickStopUrl: `${site}${refillStopPath(order.orderNumber)}`, lang })
      ok = sent.sent
      skippedSend = sent.skipped
    }
    if (ok) {
      result.sent += 1
      for (const key of keys) reached.add(key)
      await db.orderEvent.create({ data: { orderId: order.id, status: REFILL_NOTE_STATUS, message: `Running low? reminder sent by ${byWhatsApp ? 'WhatsApp' : 'email'}: ${items.map(l => l.name).join(', ')}.`.slice(0, 1000) } })
    } else {
      // Not sent: released, so a later morning tries again while it is due.
      await db.refillReminder.deleteMany({ where: { orderId: order.id, productId: { in: claimed } } })
      if (skippedSend) result.skipped += 1
      else result.failed += 1
    }
  }
  return result
}
