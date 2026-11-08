import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { reserveStock } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'
import { PaymentMethod, PaymentStatus, OrderStatus, FulfillmentStatus } from '@prisma/client'
import { nextOrderNumber } from '@/lib/order-number'
import { MANUAL_ORDER_SOURCES, manualOrderMessage } from '@/lib/manual-order'
import { runInBackground } from '@/lib/background'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const items: any[] = Array.isArray(body.items) ? body.items : []
    if (!items.length) return json({ error: 'Add at least one product' }, { status: 400 })

    // Orders taken on WhatsApp, Instagram or by phone: a name and a phone number are what the
    // driver needs. Email is optional (no email means no confirmation email, nothing else).
    const email = String(body.email || '').trim().toLowerCase().slice(0, 320)
    const name = String(body.name || '').trim().slice(0, 120)
    const phone = String(body.phone || '').trim().slice(0, 80) || null
    if (!name) return json({ error: "Add the customer's name" }, { status: 400 })
    if (!phone) return json({ error: "Add the customer's phone number" }, { status: 400 })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'That email address does not look right. Leave it empty if the customer has none.' }, { status: 400 })
    const source = MANUAL_ORDER_SOURCES.some(x => x.id === body.source) ? String(body.source) : 'other'

    const productIds: string[] = Array.from(new Set(items.map(x => String(x.productId)).filter(Boolean)))
    const products = await db.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' }, include: { inventory: true } })
    const variants = await db.productVariant.findMany({ where: { productId: { in: productIds } } })
    const variantsByProduct = new Map<string, typeof variants>()
    for (const variant of variants) { const list = variantsByProduct.get(variant.productId) || []; list.push(variant); variantsByProduct.set(variant.productId, list) }
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== productIds.length) return json({ error: 'One or more selected products are unavailable' }, { status: 400 })

    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
    for (const item of items) { const productId = String(item.productId); const variantId = item.variantId ? String(item.variantId) : null; const quantity = Math.floor(Number(item.quantity || 0)); if (quantity < 1 || quantity > 99) return json({ error: 'Quantity must be between 1 and 99' }, { status: 400 }); const key = `${productId}:${variantId || ''}`; const current = merged.get(key); const nextQty = (current?.quantity || 0) + quantity; if (nextQty > 99) return json({ error: 'Maximum quantity per line is 99' }, { status: 400 }); merged.set(key, { productId, variantId, quantity: nextQty }) }

    let subtotal = 0
    const normalized: any[] = []
    for (const line of merged.values()) { const p = byId.get(line.productId)!; const productVariants = variantsByProduct.get(line.productId) || []; const variant = line.variantId ? productVariants.find(v => v.id === line.variantId) : undefined; if (line.variantId && !variant) return json({ error: `Invalid variant for ${p.name}` }, { status: 400 }); const unitPrice = variant?.price ?? p.basePrice; subtotal += unitPrice * line.quantity; normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? p.sku, quantity: line.quantity, unitPrice, totalPrice: unitPrice * line.quantity, costPrice: p.costPrice ?? null }) }

    const discount = Math.max(0, Math.min(subtotal, Math.round(Number(body.discount || 0))))
    const shippingTotal = Math.max(0, Math.round(Number(body.shippingTotal || 0)))
    const taxTotal = Math.max(0, Math.round(Number(body.taxTotal || 0)))
    const grandTotal = Math.max(0, subtotal - discount + shippingTotal + taxTotal)
    const paymentMethod = Object.values(PaymentMethod).includes(body.paymentMethod) ? body.paymentMethod as PaymentMethod : PaymentMethod.COD
    const paymentStatus = Object.values(PaymentStatus).includes(body.paymentStatus) ? body.paymentStatus as PaymentStatus : PaymentStatus.UNPAID
    // "The customer already confirmed" (common on WhatsApp) starts the order as Confirmed.
    const status = body.confirmed === true || body.status === OrderStatus.CONFIRMED ? OrderStatus.CONFIRMED : body.status === undefined || body.status === OrderStatus.PENDING ? OrderStatus.PENDING : null
    if (!status) return json({ error: 'A new order starts as New or Confirmed and then moves through the normal steps' }, { status: 400 })
    const paymentProvider = await getPaymentProvider()
    if (paymentMethod === PaymentMethod.CARD && paymentProvider.name === 'manual') return json({ error: 'Card payments are not configured yet.' }, { status: 503 })
    const allowedInitialPaymentStatuses: PaymentStatus[] = [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.FAILED]
    if (!allowedInitialPaymentStatuses.includes(paymentStatus)) return json({ error: 'Invalid initial payment status for a manual order' }, { status: 400 })
    if (paymentStatus === PaymentStatus.PAID && grandTotal <= 0) return json({ error: 'A paid order must have a positive total' }, { status: 400 })

    const existingUser = body.customerId ? await db.user.findUnique({ where: { id: String(body.customerId) } }) : email ? await db.user.findUnique({ where: { email } }) : null
    if (body.customerId && !existingUser) return json({ error: 'Selected customer not found' }, { status: 404 })
    const address = { firstName: String(body.firstName || name.split(' ')[0] || 'Customer'), lastName: String(body.lastName || name.split(' ').slice(1).join(' ') || ''), line1: String(body.line1 || '').trim().slice(0, 300), line2: String(body.line2 || '').trim().slice(0, 300), city: String(body.city || '').trim().slice(0, 120), region: String(body.region || '').trim().slice(0, 120), postalCode: String(body.postalCode || '').trim().slice(0, 30), country: String(body.country || 'Lebanon').trim().slice(0, 80), phone: phone || '' }
    if (!address.city) return json({ error: 'Add the city or area' }, { status: 400 })
    if (!address.line1) return json({ error: 'Add the delivery address (street, building)' }, { status: 400 })
    if (!address.country) return json({ error: 'Add the country' }, { status: 400 })

    const orderNumber = await nextOrderNumber()
    const takenBy = actor.name?.trim() || actor.email
    const events: { status: string; message: string }[] = [{ status: OrderStatus.PENDING, message: manualOrderMessage(source, takenBy) }]
    if (status === OrderStatus.CONFIRMED) events.push({ status: OrderStatus.CONFIRMED, message: 'The customer confirmed the order.' })
    const currency = await getStoreCurrency()
    const order = await db.$transaction(async tx => { for (const line of normalized) await reserveStock(tx, byId.get(line.productId)!, line.variantId, line.quantity, orderNumber); return tx.order.create({ data: { orderNumber, userId: existingUser?.id ?? null, email: existingUser?.email ?? email, phone, subtotal, discountTotal: discount, shippingTotal, taxTotal, grandTotal, currency, status, paymentStatus, fulfillmentStatus: FulfillmentStatus.UNFULFILLED, paymentMethod, shippingAddressJson: JSON.stringify(address), billingAddressJson: JSON.stringify(address), notes: String(body.notes || '').trim().slice(0, 5000) || null, shippingMethod: String(body.shippingMethod || 'Delivery').trim().slice(0, 120), items: { create: normalized }, events: { create: events }, paymentTransactions: paymentStatus !== PaymentStatus.UNPAID ? { create: { provider: 'manual', externalId: null, status: paymentStatus.toLowerCase(), amount: grandTotal, currency } } : undefined }, include: { items: true } }) })
    runInBackground(sendNewOrderPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[push] manual-order notification failed', error)))
    if (order.email && (paymentStatus !== PaymentStatus.UNPAID || paymentMethod !== PaymentMethod.CARD)) {
      runInBackground(sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error)))
    }
    runInBackground(dispatchWebhookEvent('order.created', { id: order.id, orderNumber: order.orderNumber, email: order.email, grandTotal: order.grandTotal, currency: order.currency, status: order.status, paymentStatus: order.paymentStatus }).catch(error => console.error('[webhook] order.created dispatch failed', error)))
    await audit(actor.id, 'order.created_manual', 'Order', order.id, { orderNumber, total: grandTotal, paymentMethod, paymentStatus, source })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal } }, { status: 201 })
  } catch (e) { const message = e instanceof Error ? e.message : 'Unable to create manual order'; return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 }) }
}
