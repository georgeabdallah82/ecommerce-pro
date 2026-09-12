import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { reserveStock } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { json } from '@/lib/utils'
import { PaymentMethod, PaymentStatus, OrderStatus, FulfillmentStatus } from '@prisma/client'

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const body = await req.json()
    const items: any[] = Array.isArray(body.items) ? body.items : []
    if (!items.length) return json({ error: 'Add at least one product' }, { status: 400 })

    const email = String(body.email || '').trim().toLowerCase()
    const name = String(body.name || '').trim() || 'Manual customer'
    const phone = String(body.phone || '').trim() || null
    if (!email || !email.includes('@')) return json({ error: 'A valid customer email is required' }, { status: 400 })

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
    for (const line of merged.values()) { const p = byId.get(line.productId)!; const productVariants = variantsByProduct.get(line.productId) || []; const variant = line.variantId ? productVariants.find(v => v.id === line.variantId) : undefined; if (line.variantId && !variant) return json({ error: `Invalid variant for ${p.name}` }, { status: 400 }); const unitPrice = variant?.price ?? p.basePrice; subtotal += unitPrice * line.quantity; normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? p.sku, quantity: line.quantity, unitPrice, totalPrice: unitPrice * line.quantity }) }

    const discount = Math.max(0, Math.min(subtotal, Math.round(Number(body.discount || 0))))
    const shippingTotal = Math.max(0, Math.round(Number(body.shippingTotal || 0)))
    const taxTotal = Math.max(0, Math.round(Number(body.taxTotal || 0)))
    const grandTotal = Math.max(0, subtotal - discount + shippingTotal + taxTotal)
    const paymentMethod = Object.values(PaymentMethod).includes(body.paymentMethod) ? body.paymentMethod as PaymentMethod : PaymentMethod.COD
    const paymentStatus = Object.values(PaymentStatus).includes(body.paymentStatus) ? body.paymentStatus as PaymentStatus : PaymentStatus.UNPAID
    const status = Object.values(OrderStatus).includes(body.status) ? body.status as OrderStatus : OrderStatus.PENDING
    const paymentProvider = await getPaymentProvider()
    if (paymentMethod === PaymentMethod.CARD && paymentProvider.name === 'manual') return json({ error: 'Card payments are not configured yet.' }, { status: 503 })
    const allowedInitialPaymentStatuses: PaymentStatus[] = [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.FAILED]
    if (!allowedInitialPaymentStatuses.includes(paymentStatus)) return json({ error: 'Invalid initial payment status for a manual order' }, { status: 400 })
    if (paymentStatus === PaymentStatus.PAID && grandTotal <= 0) return json({ error: 'A paid order must have a positive total' }, { status: 400 })
    if (status !== OrderStatus.PENDING) return json({ error: 'Manual orders must start as PENDING and can then move through the normal order workflow' }, { status: 400 })

    const existingUser = body.customerId ? await db.user.findUnique({ where: { id: String(body.customerId) } }) : await db.user.findUnique({ where: { email } })
    if (body.customerId && !existingUser) return json({ error: 'Selected customer not found' }, { status: 404 })
    const address = { firstName: String(body.firstName || name.split(' ')[0] || 'Customer'), lastName: String(body.lastName || name.split(' ').slice(1).join(' ') || ''), line1: String(body.line1 || '').trim(), line2: String(body.line2 || '').trim(), city: String(body.city || '').trim(), region: String(body.region || '').trim(), postalCode: String(body.postalCode || '').trim(), country: String(body.country || 'Lebanon').trim(), phone: phone || '' }
    if (!address.line1 || !address.city || !address.country) return json({ error: 'Shipping address is required' }, { status: 400 })

    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const order = await db.$transaction(async tx => { for (const line of normalized) await reserveStock(tx, byId.get(line.productId)!, line.variantId, line.quantity, orderNumber); return tx.order.create({ data: { orderNumber, userId: existingUser?.id ?? null, email: existingUser?.email ?? email, phone, subtotal, discountTotal: discount, shippingTotal, taxTotal, grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD', status, paymentStatus, fulfillmentStatus: FulfillmentStatus.UNFULFILLED, paymentMethod, shippingAddressJson: JSON.stringify(address), billingAddressJson: JSON.stringify(address), notes: String(body.notes || '').trim().slice(0, 5000) || `Manual order created by ${actor.email}`, shippingMethod: String(body.shippingMethod || 'Manual').trim().slice(0, 120), items: { create: normalized }, events: { create: { status: OrderStatus.PENDING, message: 'Manual order created by admin.' } }, paymentTransactions: paymentStatus !== PaymentStatus.UNPAID ? { create: { provider: 'manual', externalId: null, status: paymentStatus.toLowerCase(), amount: grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD' } } : undefined }, include: { items: true } }) })
    void sendNewOrderPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[push] manual-order notification failed', error))
    if (paymentStatus !== PaymentStatus.UNPAID || paymentMethod !== PaymentMethod.CARD) {
      void sendOrderConfirmationEmail(order.id).catch(error => console.error('[email] order confirmation failed', error))
    }
    await audit(actor.id, 'order.created_manual', 'Order', order.id, { orderNumber, total: grandTotal, paymentMethod, paymentStatus })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal } }, { status: 201 })
  } catch (e) { const message = e instanceof Error ? e.message : 'Unable to create manual order'; return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 }) }
}
