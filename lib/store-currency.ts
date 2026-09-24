import { db } from '@/lib/prisma'

// process.env.NEXT_PUBLIC_CURRENCY is only ever a build-time default -- it's what
// prisma/seed.ts seeds the store.currency Setting with in the first place. Settings >
// Markets' Currency field is the actual runtime source of truth once a store has set one, so
// every server-side path that creates a real money record (an order, a gift card, a wallet
// transaction, a purchase order...) reads it here instead of reaching for the env var
// directly, or changing the store's currency in the admin UI would silently do nothing.
export async function getStoreCurrency(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: 'store.currency' } })
  return row?.value?.trim() || process.env.NEXT_PUBLIC_CURRENCY || 'USD'
}
