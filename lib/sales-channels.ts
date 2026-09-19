import { db } from '@/lib/prisma'

// The one sales channel that represents this storefront. Merchants can create other
// channels (POS, marketplaces, etc.) through the existing Sales channels admin panel,
// but the public storefront only ever needs to check this one. Created lazily the
// first time it's needed, so a fresh store always has something to toggle without
// requiring a merchant to go create it manually first.
export const STOREFRONT_CHANNEL_HANDLE = 'online-store'

export async function ensureStorefrontChannel() {
  const existing = await db.salesChannel.findUnique({ where: { handle: STOREFRONT_CHANNEL_HANDLE } })
  if (existing) return existing
  return db.salesChannel.create({ data: { name: 'Online Store', handle: STOREFRONT_CHANNEL_HANDLE } })
}

// Products are visible by default -- a product with no ProductPublication row at all
// (which is every product today, since nothing has ever written one) stays visible.
// This only ever needs to list the explicit opt-outs, which in practice is a small,
// normally empty set, so one unscoped query per request is cheap.
export async function getUnpublishedProductIds(): Promise<string[]> {
  const rows = await db.productPublication.findMany({
    where: { available: false, channel: { handle: STOREFRONT_CHANNEL_HANDLE } },
    select: { productId: true },
  })
  return rows.map(row => row.productId)
}

export async function isProductPublished(productId: string): Promise<boolean> {
  const row = await db.productPublication.findFirst({
    where: { productId, available: false, channel: { handle: STOREFRONT_CHANNEL_HANDLE } },
    select: { id: true },
  })
  return !row
}
