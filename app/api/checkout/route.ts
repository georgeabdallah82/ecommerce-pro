import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { checkoutSchema } from '@/lib/validation'
import { json } from '@/lib/utils'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { reserveStock } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { PaymentMethod } from '@prisma/client'

async function applyCoupon(code: string, subtotal: number) {
  if (!code) return { discount: 0, coupon: null as any }
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } })
  const now = new Date()
  if (!coupon || !coupon.isActive) throw new Error('Invalid coupon code')
  if (coupon.type === 'PERCENTAGE' && (coupon.value < 1 || coupon.value > 100)) throw new Error('This discount is not configured correctly')
  if (coupon.startsAt && coupon.startsAt > now) throw new Error('This coupon is not active yet')
  if (coupon.expiresAt && coupon.expiresAt < now) throw new Error('This coupon has expired')
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit')
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) throw new Error('Minimum order is required for this coupon')
  if (coupon.firstOrderOnly && !arguments.length) throw new Error('This coupon requires a customer account')
  const discount = coupon.type === 'PERCENTAGE' ? Math.min(subtotal, Math.floor(subtotal * coupon.value / 100)) : coupon.type === 'FIXED' ? Math.min(subtotal, coupon.value) : 0
  return { discount, coupon }
}

export async function POST(req: Request) {
  try {
    const input = checkoutSchema.parse(await req.json())
    const user = await getCurrentUser()
    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim().slice(0, 190) || null
    const paymentMethod = input.paymentMethod as PaymentMethod
    const paymentProvider = getPaymentProvider()

    if (paymentMethod === PaymentMethod.CARD && paymentProvider.name === 'manual') {
      return json({ error: 'Card payments are not configured yet.' }, { status: 503 })
    }

    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
    for (const item of input.items) {
      const key = `${item.productId}:${item.variantId ?? ''}`
      const current = merged.get(key)
      const quantity = (current?.quantity ?? 0) + item.quantity
      if (quantity > 99) throw new Error('Maximum quantity per product is 99')
      merged.set(key, { productId: item.productId, variantId: item.variantId ?? null, quantity })
    }

    const ids = [...new Set([...merged.values()].map(i => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { variants: true, inventory: true, images: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== ids.length) return json({ error: 'One or more products are unavailable' }, { status: 400 })

    const normalized: any[] = []
    let subtotal = 0
    for (const raw of merged.values()) {
      const p = byId.get(raw.productId)!
      const variant = raw.variantId ? p.variants.find(v => v.id === raw.variantId) : undefined
      if (raw.variantId && !variant) return json({ error: `Invalid variant for ${p.name}` }, { status: 400 })
      if (p.trackInventory && !p.continueSellingWhenOutOfStock) {
        const dedicated = raw.variantId ? p.inventory.filter(x => x.variantId === raw.variantId) : []
        const stockRows = dedicated.length ? dedicated : p.inventory.filter(x => !x.variantId)
        const available = stockRows.reduce((s, x) => s + x.quantity - x.reserved, 0)
        if (available < raw.quantity) return json({ error: `Not enough stock for ${p.name}` }, { status: 409 })
      }
      const unitPrice = variant?.price ?? p.basePrice
      subtotal += unitPrice * raw.quantity
      normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? p.sku, quantity: raw.quantity, unitPrice, totalPrice: unitPrice * raw.quantity })
    }

    const { discount, coupon } = await applyCoupon(input.couponCode || '', subtotal)
    if (coupon?.firstOrderOnly && !user?.id) throw new Error('This coupon requires a customer account')
    const discountedSubtotal = Math.max(0, subtotal - discount)
    const shipping = await calculateShipping(input.shippingAddress.country, discountedSubtotal)
    const taxRate = await getTaxRatePercent()
    const taxTotal = Math.round(discountedSubtotal * taxRate / 100)
    const shippingTotal = coupon?.type === 'FREE_SHIPPING' ? 0 : shipping.total
    const grandTotal = Math.max(0, discountedSubtotal + shippingTotal + taxTotal)
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const result = await db.$transaction(async tx => {
      if (idempotencyKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`
        const existing = await tx.paymentTransaction.findFirst({ where: { provider: 'checkout', externalId: idempotencyKey }, include: { order: true } })
        if (existing?.order) return { existing: true as const, order: existing.order }
      }

      if (coupon?.firstOrderOnly && user?.id) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`first-order:${user.id}`}))`
        const existingOrder = await tx.order.findFirst({ where: { userId: user.id, status: { not: 'CANCELLED' } }, select: { id: true } })
        if (existingOrder) throw new Error('This coupon is for first orders only')
      }

      for (const item of normalized) await reserveStock(tx, byId.get(item.productId)!, item.variantId, item.quantity, orderNumber)
      if (coupon) {
        const couponUpdate = await tx.coupon.updateMany({ where: { id: coupon.id, isActive: true, ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}) }, data: { usedCount: { increment: 1 } } })
        if (couponUpdate.count !== 1) throw new Error('This coupon is no longer available')
      }
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user?.id ?? null,
          email: input.email,
          phone: input.phone || null,
          subtotal,
          discountTotal: discount,
          shippingTotal,
          taxTotal,
          grandTotal,
          currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD',
          paymentMethod,
          shippingAddressJson: JSON.stringify(input.shippingAddress),
          couponCode: coupon?.code ?? null,
          shippingMethod: shipping.method,
          items: { create: normalized },
          events: { create: { status: 'PENDING', message: 'Order placed successfully.' } },
          paymentTransactions: { create: { provider: 'checkout', externalId: idempotencyKey, status: 'created', amount: grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD' } },
        },
      })
      return { existing: false as const, order }
    })

    if (result.existing) return json({ order: { id: result.order.id, orderNumber: result.order.orderNumber, total: result.order.grandTotal } }, { status: 200 })

    const order = result.order
    if (user?.id) await db.notification.create({ data: { userId: user.id, title: 'Order placed', body: `Order ${order.orderNumber} was placed successfully.`, type: 'ORDER_CREATED' } })
    void sendNewOrderPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[push] new-order notification failed', error))
    await audit(user?.id, 'order.created', 'Order', order.id, { orderNumber, total: grandTotal, paymentMethod })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to place order'
    return json({ error: message }, { status: 400 })
  }
}
