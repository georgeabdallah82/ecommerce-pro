import { randomBytes } from 'node:crypto'
import { OrderStatus, PaymentStatus } from '@prisma/client'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { collectsCashOnDelivery, fulfillmentForStatus } from '@/lib/orders'
import { runInBackground } from '@/lib/background'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { issueAndNotifyGiftCardsForOrder } from '@/lib/email'
import { sendDriverUpdatePush } from '@/lib/push'
import { money } from '@/lib/config'
import { problemLabel, type ProblemReason } from '@/lib/drivers-shared'
import { userError } from '@/lib/user-error'
import { sendOrderWhatsApp } from '@/lib/whatsapp-cloud'

// Drivers, the database side (rules in lib/drivers-shared.ts). A driver's link is a long random
// code: whoever has it sees that driver's current deliveries, so a new link can replace it at
// any time (Admin > Orders > Drivers) and a driver who is turned off can't open theirs.

export const newDriverToken = () => randomBytes(24).toString('base64url')
// A driver's link works for this long after it is made; the admin can make a new one any time.
export const DRIVER_LINK_DAYS = 90
export const driverLinkExpiry = (now = new Date()) => new Date(now.getTime() + DRIVER_LINK_DAYS * 24 * 60 * 60 * 1000)

export async function driverForToken(token: string | null | undefined) {
  const code = String(token || '')
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(code)) return null
  return db.driver.findFirst({ where: { token: code, active: true, tokenExpiresAt: { gt: new Date() } }, select: { id: true, name: true, phone: true } })
}

type Driver = { id: string; name: string }

// The driver's "Delivered": the same as staff marking a shipped order delivered (cash on
// delivery is then marked paid), plus the cash the driver now holds for the store. `origin` is
// the store's address, for the links in the customer's WhatsApp message.
export async function markDeliveredByDriver(driver: Driver, orderId: string, origin = '') {
  const result = await db.$transaction(async tx => {
    const order = await tx.order.findFirst({ where: { id: orderId, driverId: driver.id }, select: { id: true, orderNumber: true, userId: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, currency: true } })
    if (!order) throw userError('This order is not on your list.')
    if (order.status === OrderStatus.DELIVERED) return { order, already: true as const, cash: 0 }
    if (order.status !== OrderStatus.SHIPPED) throw userError('This order is not out for delivery yet.')
    const cod = collectsCashOnDelivery({ paymentMethod: String(order.paymentMethod), paymentStatus: order.paymentStatus })
    const cash = cod ? order.grandTotal : 0
    // Only from "out for delivery", so two taps (or staff at the same moment) count it once.
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.SHIPPED },
      data: { status: OrderStatus.DELIVERED, fulfillmentStatus: fulfillmentForStatus(OrderStatus.DELIVERED), ...(cod ? { paymentStatus: PaymentStatus.PAID, cashCollected: cash } : {}) },
    })
    if (changed.count !== 1) return { order, already: true as const, cash: 0 }
    await tx.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.DELIVERED, message: `Delivered by ${driver.name}.${cod ? ` Cash collected on delivery (${money(cash, order.currency)}), marked as paid.` : ''}` } })
    return { order, already: false as const, cash }
  })
  if (result.already) return result
  const { order, cash } = result
  if (order.userId) await db.notification.create({ data: { userId: order.userId, title: `Order ${order.orderNumber} updated`, body: 'Your order is now delivered.', type: 'ORDER_STATUS' } }).catch(() => {})
  if (cash) runInBackground(issueAndNotifyGiftCardsForOrder(order.id).catch(error => console.error('[email] gift card issuance on delivery failed', error)))
  const payload = { id: order.id, orderNumber: order.orderNumber, status: OrderStatus.DELIVERED, paymentStatus: cash ? PaymentStatus.PAID : order.paymentStatus, fulfillmentStatus: fulfillmentForStatus(OrderStatus.DELIVERED) }
  runInBackground(dispatchWebhookEvent('order.updated', payload).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
  runInBackground(dispatchWebhookEvent('order.fulfilled', payload).catch(error => console.error('[webhook] order.fulfilled dispatch failed', error)))
  runInBackground(sendOrderWhatsApp(order.id, OrderStatus.DELIVERED, origin).catch(error => console.error('[whatsapp] order update failed', error)))
  runInBackground(sendDriverUpdatePush({ title: `#${order.orderNumber} delivered`, body: `${driver.name}${cash ? ` collected ${money(cash, order.currency)}` : ' delivered it (already paid)'}`, orderId: order.id }).catch(error => console.error('[push] driver update failed', error)))
  await audit(null, 'order.delivered_by_driver', 'Order', order.id, { driverId: driver.id, cashCollected: cash })
  return result
}

// "Couldn't deliver": noted on the order for staff, who decide what happens next. The order
// stays out for delivery.
export async function reportDeliveryProblem(driver: Driver, orderId: string, reason: ProblemReason, note: string) {
  const order = await db.order.findFirst({ where: { id: orderId, driverId: driver.id }, select: { id: true, orderNumber: true, status: true } })
  if (!order) throw userError('This order is not on your list.')
  if (order.status !== OrderStatus.SHIPPED) throw userError('This order is not out for delivery.')
  const text = `${problemLabel(reason)}${note ? `: ${note}` : ''}`
  await db.orderEvent.create({ data: { orderId: order.id, status: OrderStatus.SHIPPED, message: `${driver.name} could not deliver. ${text}` } })
  runInBackground(sendDriverUpdatePush({ title: `#${order.orderNumber}: not delivered`, body: `${driver.name}: ${text}`, orderId: order.id }).catch(error => console.error('[push] driver update failed', error)))
  await audit(null, 'order.driver_problem', 'Order', order.id, { driverId: driver.id, reason, note })
  return order
}
