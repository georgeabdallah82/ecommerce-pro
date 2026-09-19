import { db } from '@/lib/prisma'
import { reserveStock } from '@/lib/inventory'
import type { PaymentMethod } from '@prisma/client'

// Shared by the admin "Complete order" action (force-completes as COD, staff
// collects payment separately) and the customer-facing invoice payment flow
// (completes as CARD, then hands off to the configured online payment
// provider) -- both create the same real Order from the same draft contents,
// they only differ in which payment method the resulting order is tagged with.
export async function completeDraftOrder(draftId: string, paymentMethod: PaymentMethod = 'COD') {
  const draft = await db.draftOrder.findUnique({ where: { id: draftId }, include: { items: true } })
  if (!draft) throw new Error('Draft order not found')
  if (draft.status === 'COMPLETED') throw new Error('Draft order is already completed')
  if (draft.status === 'CANCELLED') throw new Error('Cancelled draft order cannot be completed')

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const productIds = [...new Set(draft.items.map(i => i.productId))]
  const products = await db.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' }, include: { variants: true, inventory: true } })
  const byId = new Map(products.map(p => [p.id, p]))

  return db.$transaction(async tx => {
    for (const item of draft.items) {
      const product = byId.get(item.productId)
      if (!product) throw new Error(`Product ${item.productId} is not available`)
      await reserveStock(tx, product, item.variantId, item.quantity, orderNumber)
    }
    const order = await tx.order.create({
      data: {
        orderNumber,
        userId: draft.customerId,
        email: draft.email,
        phone: draft.phone,
        subtotal: draft.subtotal,
        discountTotal: draft.discountTotal,
        shippingTotal: draft.shippingTotal,
        taxTotal: draft.taxTotal,
        grandTotal: draft.grandTotal,
        currency: draft.currency,
        paymentMethod,
        shippingAddressJson: draft.shippingAddressJson || JSON.stringify({}),
        billingAddressJson: draft.billingAddressJson,
        notes: draft.notes,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        fulfillmentStatus: 'UNFULFILLED',
        items: { create: draft.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })) },
        events: { create: { status: 'PENDING', message: `Created from draft order ${draft.orderNumber}.` } },
        paymentTransactions: { create: { provider: 'manual', status: 'created', amount: draft.grandTotal, currency: draft.currency } },
      },
    })
    await tx.draftOrder.update({ where: { id: draftId }, data: { status: 'COMPLETED', completedOrderId: order.id } })
    return order
  })
}
