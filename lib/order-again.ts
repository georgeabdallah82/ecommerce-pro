import { db } from '@/lib/prisma'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import type { CartItem } from '@/components/cart-provider'

// "Order again" on a past order (app/account/orders/[orderNumber]): the same products at
// today's price, as many as are in stock. Products no longer for sale and free gifts are left
// out.
export async function orderAgainItems(orderId: string): Promise<CartItem[]> {
  const items = await db.orderItem.findMany({ where: { orderId }, select: { productId: true, variantId: true, quantity: true, unitPrice: true, name: true } })
  const paid = items.filter(i => !(i.unitPrice === 0 && /\(Free gift\)$/.test(i.name)))
  if (!paid.length) return []
  const [hidden, products] = await Promise.all([
    getUnpublishedProductIds(),
    db.product.findMany({
      where: { id: { in: [...new Set(paid.map(i => i.productId))] }, status: 'ACTIVE', giftCard: false },
      include: { variants: true, inventory: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
  ])
  const byId = new Map(products.filter(p => !hidden.includes(p.id)).map(p => [p.id, p]))
  const lines: CartItem[] = []
  for (const item of paid) {
    const p = byId.get(item.productId)
    if (!p) continue
    const variant = item.variantId ? p.variants.find(v => v.id === item.variantId) : null
    if (item.variantId && !variant) continue
    let quantity = item.quantity
    if (p.trackInventory && !p.continueSellingWhenOutOfStock) {
      const dedicated = variant ? p.inventory.filter(x => x.variantId === variant.id) : []
      const rows = dedicated.length ? dedicated : p.inventory.filter(x => !x.variantId)
      quantity = Math.min(quantity, Math.max(0, rows.reduce((sum, x) => sum + x.quantity - x.reserved, 0)))
    }
    if (quantity <= 0) continue
    lines.push({
      productId: p.id,
      variantId: variant?.id ?? null,
      name: variant ? `${p.name} — ${variant.name}` : p.name,
      sku: variant?.sku || p.sku,
      price: variant?.price ?? p.basePrice,
      image: p.images[0]?.url || '',
      quantity: Math.min(99, quantity),
    })
  }
  return lines
}
