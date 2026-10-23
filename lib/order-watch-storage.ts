import { db } from '@/lib/prisma'
import { getMediaBucket } from '@/lib/media-storage'
import { DEFAULT_STORE_TIMEZONE } from '@/lib/admin-datetime'
import { ORDER_WATCH_KEY, parseWatch, type OrderWatch } from '@/lib/order-watch'

// The marker file (lib/order-watch.ts). Every function here is best effort: a missing bucket (local
// development) or a failed write never affects an order.

export async function readOrderWatch(): Promise<OrderWatch | null> {
  const bucket = await getMediaBucket()
  if (!bucket) return null
  const object = await bucket.get(ORDER_WATCH_KEY)
  return object ? parseWatch(await object.text()) : null
}

export async function writeOrderWatch(watch: OrderWatch) {
  const bucket = await getMediaBucket()
  if (!bucket) return false
  await bucket.put(ORDER_WATCH_KEY, JSON.stringify(watch), { httpMetadata: { contentType: 'application/json' } })
  return true
}

// An order just arrived (or the daily job found a waiting one): watch it. Keeps the list of orders
// already told about, and writes the store's timezone so the 15-minute check can skip the night
// without touching the database.
export async function armOrderWatch(now = new Date()) {
  try {
    const [previous, timezone] = await Promise.all([
      readOrderWatch(),
      db.setting.findUnique({ where: { key: 'store.timezone' } }).then(row => row?.value?.trim() || DEFAULT_STORE_TIMEZONE),
    ])
    await writeOrderWatch({ armed: true, since: previous?.armed ? previous.since : now.getTime(), tz: timezone, alerted: previous?.alerted || [] })
  } catch (error) {
    console.error('[order-watch] could not arm', error)
  }
}
