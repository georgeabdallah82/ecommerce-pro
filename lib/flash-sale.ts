import { db } from '@/lib/prisma'

// Flash sales: automatic percentage discounts marked "Flash sale" (Admin > Discounts) that end
// at a set time. The store shows their sale price and a countdown; checkout applies them like
// any automatic discount (lib/checkout-discounts.ts), so the price paid always matches.

import type { FlashSale } from '@/lib/flash-sale-shared'
export { countdown, saleFor, salePrice, type FlashSale } from '@/lib/flash-sale-shared'

export async function activeFlashSales(now = new Date()): Promise<FlashSale[]> {
  const coupons = await db.coupon.findMany({
    where: { isActive: true, isAutomatic: true, flashSale: true, type: 'PERCENTAGE', expiresAt: { gt: now }, OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    select: { id: true, value: true, expiresAt: true, appliesTo: true, productIds: true, collectionIds: true, minSubtotal: true, maxUses: true, usedCount: true },
  })
  const sales: FlashSale[] = []
  for (const c of coupons) {
    // A minimum order or a used-up limit would make the shown price untrue: not shown as a sale.
    if (c.minSubtotal || (c.maxUses !== null && c.usedCount >= c.maxUses) || c.value < 1 || c.value > 100 || !c.expiresAt) continue
    let productIds: string[] = []
    if (c.appliesTo === 'SPECIFIC_PRODUCTS') productIds = c.productIds
    else if (c.appliesTo === 'SPECIFIC_COLLECTIONS' && c.collectionIds.length) {
      const links = await db.collectionProduct.findMany({ where: { collectionId: { in: c.collectionIds } }, select: { productId: true } })
      productIds = [...new Set(links.map(l => l.productId))]
    }
    sales.push({ id: c.id, percent: c.value, endsAt: c.expiresAt.toISOString(), all: c.appliesTo === 'ALL_PRODUCTS', productIds })
  }
  return sales
}

