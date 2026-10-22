import { db } from '@/lib/prisma'
import { GUEST_CANCEL_ENABLED_KEY, GUEST_CANCEL_MINUTES_KEY, guestCancelConfig } from '@/lib/guest-cancel'

// The owner's "cancel without an account" settings (Settings > Selling tools).
export async function getGuestCancelConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: [GUEST_CANCEL_ENABLED_KEY, GUEST_CANCEL_MINUTES_KEY] } }, select: { key: true, value: true } })
  return guestCancelConfig(new Map(rows.map(r => [r.key, r.value])))
}
