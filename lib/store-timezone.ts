import { db } from '@/lib/prisma'
import { DEFAULT_STORE_TIMEZONE } from '@/lib/admin-datetime'

// Server-only counterpart to lib/admin-datetime.ts's formatting functions -- fetches the
// store.timezone setting (same key/default as components/settings-center-pro.tsx) for a server
// component to pass down as a prop to the client components that render order/audit timestamps.
export async function getStoreTimezone(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: 'store.timezone' } })
  return setting?.value?.trim() || DEFAULT_STORE_TIMEZONE
}
