import { db } from '@/lib/prisma'
import { QUANTITY_DEALS_SETTING, normalizeQuantityDeals, type QuantityDealsConfig } from '@/lib/quantity-deals-shared'

// Quantity deals are kept in one setting row (like Bundles): a store has a handful at most.
// Checkout and the price summary read it fresh, so a change in the admin applies to the next
// price at once; the storefront pages read it through the shared selling config.
export async function getQuantityDeals(): Promise<QuantityDealsConfig> {
  const row = await db.setting.findUnique({ where: { key: QUANTITY_DEALS_SETTING } })
  if (!row?.value) return { enabled: false, deals: [] }
  try { return normalizeQuantityDeals(JSON.parse(row.value)) } catch { return { enabled: false, deals: [] } }
}

export async function saveQuantityDeals(config: QuantityDealsConfig) {
  const value = JSON.stringify(normalizeQuantityDeals(config))
  await db.setting.upsert({ where: { key: QUANTITY_DEALS_SETTING }, update: { value }, create: { key: QUANTITY_DEALS_SETTING, value } })
}
