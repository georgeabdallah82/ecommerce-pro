import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { checkoutSchema } from '@/lib/validation'
import { json } from '@/lib/utils'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { PaymentMethod } from '@prisma/client'

async function applyCoupon(code: string, subtotal: number, userId?: string | null) {
  if (!code) return { discount: 0, coupon: null as any }
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } })
  const now = new Date()
  if (!coupon || !coupon.isActive) throw new Error('Invalid coupon code')
  if (coupon.startsAt && coupon.startsAt > now) throw new Error('This coupon is not active yet')
  if (coupon.expiresAt && coupon.expiresAt < now) throw new Error('This coupon has expired')
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit')
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) throw new Error(`Minimum order is required for this coupon`)
  if (coupon.firstOrderOnly && userId) {
    const count = await db.order.count({ where: { userId, status: { not: 'CANCELLED' } } })
    if (count > 0) throw new Error('This coupon is for first orders only')
  }
  const discount = coupon.type === 'PERCENTAGE' ? Math.min(subtotal, Math.floor(subtotal * coupon.value / 100)) : coupon.type === 'FIXED' ? Math.min(subtotal, coupon.value) : 0
  return { discount, coupon }
}

export async function POST(req: Request) {
  try {
    const input = checkoutSchema.parse(await req.json())
    const user = await getCurrentUser()
    const ids = [...new Set(input.items.map(i => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { variants: true, inventory: true, images: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    if (products.length !== ids.length) return json({ error: 'One or more products are unavailable' }, { status: 400 })

    const normalized: any[] = []
    let subtotal = 0
    for (const raw of input.items) {
      const p = byId.get(raw.productId)!
      const variant = raw.variantId ? p.variants.find(v => v.id === raw.variantId) : undefined
      if (raw.variantId && !variant) return json({ error: `Invalid variant for ${p.name}` }, { status: 400 })
      const stockRows = p.inventory.filter(x => (variant ? x.variantId === variant.id : !x.variantId))
      const available = stockRows.reduce((s, x) => s + x.quantity - x.reserved, 0)
      if (available < raw.quantity) return json({ error: `Not enough stock for ${p.name}` }, { status: 409 })
      const unitPrice = variant?.price ?? p.basePrice
      subtotal += unitPrice * raw.quantity
      normalized.push({ productId: p.id, variantId: variant?.id ?? null, name: p.name + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? p.sku, quantity: raw.quantity, unitPrice, totalPrice: unitPrice * raw.quantity })
    }

    const { discount, coupon } = await applyCoupon(input.couponCode || '', subtotal, user?.id)
    const discountedSubtotal = Math.max(0, subtotal - discount)
    const shipping = await calculateShipping(input.shippingAddress.country, discountedSubtotal)
    const taxRate = await getTaxRatePercent()
    const taxTotal = Math.round(discountedSubtotal * taxRate / 100)
    const shippingTotal = shipping.total
    const grandTotal = Math.max(0, discountedSubtotal + shippingTotal + taxTotal)
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const paymentMethod = input.paymentMethod as PaymentMethod

    const order = await db.$transaction(async tx => {
      for (const item of input.items) {
        const p = byId.get(item.productId)!
        const variant = item.variantId ? p.variants.find(v => v.id === item.variantId) : undefined
        const stockRows = p.inventory.filter(x => (variant ? x.variantId === variant.id : !x.variantId))
        let remaining = item.quantity
        for (const stock of stockRows) {
          if (remaining <= 0) break
          const canReserve = Math.min(remaining, Math.max(0, stock.quantity - stock.reserved))
          if (canReserve <= 0) continue

          const affected = await tx.inventoryItem.updateMany({
            where: {
              id: stock.id,
              reserved: {
                lte: stock.quantity - canReserve,
              },
            },
            data: {
              reserved: {
                increment: canReserve,
              },
            },
          })

          if (affected.count === 1) {
            await tx.inventoryMovement.create({ data: { inventoryId: stock.id, type: 'SALE_RESERVATION', quantity: canReserve, reason: 'Checkout reservation', referenceId: orderNumber } })
            remaining -= canReserve
          }
        }
        if (remaining > 0) throw new Error(`Stock changed for ${p.name}. Please try again.`)
      }

      const created = await tx.order.create({ data: { orderNumber, userId: user?.id ?? null, email: input.email, phone: input.phone || null, subtotal, discountTotal: discount, shippingTotal, taxTotal, grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD', paymentMethod, shippingAddressJson: JSON.stringify(input.shippingAddress), couponCode: coupon?.code ?? null, shippingMethod: shipping.method, items: { create: normalized }, events: { create: { status: 'PENDING', message: 'Order placed successfully.' } }, paymentTransactions: { create: { provider: 'manual', status: 'created', amount: grandTotal, currency: process.env.NEXT_PUBLIC_CURRENCY || 'USD' } } } })
      if (coupon) await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } })
      return created
    })
    await audit(user?.id, 'order.created', 'Order', order.id, { orderNumber, total: grandTotal, paymentMethod })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to place order'
    return json({ error: message }, { status: 400 })
  }
}
