import { db } from '@/lib/prisma'
import { DELIVERY_SLOTS_SETTING, normalizeSlots, type DeliverySlotsConfig } from '@/lib/delivery-slots'

// The owner's delivery times (Admin > Shipping), the database side (the rules are in lib/delivery-slots.ts).
export async function getDeliverySlots(): Promise<DeliverySlotsConfig> {
  const row = await db.setting.findUnique({ where: { key: DELIVERY_SLOTS_SETTING }, select: { value: true } })
  return normalizeSlots(row?.value)
}

export async function saveDeliverySlots(config: DeliverySlotsConfig) {
  await db.setting.upsert({ where: { key: DELIVERY_SLOTS_SETTING }, create: { key: DELIVERY_SLOTS_SETTING, value: JSON.stringify(config) }, update: { value: JSON.stringify(config) } })
}
