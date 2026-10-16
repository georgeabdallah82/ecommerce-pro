import { db } from '@/lib/prisma'
import { getSellingConfig } from '@/lib/selling-config'

// "Free gift on orders over $X" (Settings > Selling tools): the gift line checkout adds to an
// order whose products reach the amount, while the gift product is in stock. Priced at 0 and
// reserved like any other item, so stock stays right.
export async function freeGiftFor(subtotal: number) {
  const cfg = (await getSellingConfig().catch(() => null))?.freeGift
  if (!cfg || subtotal < cfg.threshold) return null
  const product = await db.product.findFirst({ where: { id: cfg.productId, status: 'ACTIVE' }, include: { variants: true, inventory: true, images: { orderBy: { sortOrder: 'asc' } } } })
  if (!product) return null
  const stockFor = (variantId: string | null) => {
    if (!product.trackInventory || product.continueSellingWhenOutOfStock) return Infinity
    const dedicated = variantId ? product.inventory.filter(x => x.variantId === variantId) : []
    const rows = dedicated.length ? dedicated : product.inventory.filter(x => !x.variantId)
    return rows.reduce((sum, x) => sum + x.quantity - x.reserved, 0)
  }
  // A product with options gives the first option still in stock.
  const variant = product.variants.length ? product.variants.find(v => stockFor(v.id) > 0) : null
  if (product.variants.length ? !variant : stockFor(null) <= 0) return null
  return {
    product,
    image: product.images[0]?.url || '',
    line: {
      productId: product.id,
      variantId: variant?.id ?? null,
      name: `${product.name}${variant ? ` — ${variant.name}` : ''} (Free gift)`,
      sku: variant?.sku ?? product.sku,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      taxable: false,
    },
  }
}
