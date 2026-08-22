import { db } from '@/lib/prisma'

export async function getAvailableStock(productId: string, variantId?: string | null) {
  const rows = await db.inventoryItem.findMany({ where: { productId, ...(variantId ? { variantId } : {}) } })
  return rows.reduce((sum, row) => sum + Math.max(0, row.quantity - row.reserved), 0)
}

export function productPrice(basePrice: number, variantPrice?: number | null) { return variantPrice ?? basePrice }
