import { cache } from 'react'
import { db } from '@/lib/prisma'

// Every storefront page needs the theme, menu, tracking pixels and SEO defaults. They used to
// be read with separate queries (layout, metadata and page each asking again), each one a
// round trip to the database. This reads them all in one query, once per page render
// (React cache scopes it to a single request, so nothing is ever stale).
export const STOREFRONT_SETTING_KEYS = [
  'theme.config', 'theme.sections', 'navigation.main',
  'tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId',
  'seo.title', 'seo.description', 'seo.image', 'store.name',
  // For the default search description (lib/seo.ts) when the merchant hasn't written one.
  'store.country', 'store.currency', 'checkout.freeShippingThreshold', 'payment.cod', 'returns.enabled',
] as const

export const getStorefrontSettings = cache(async (): Promise<Map<string, string>> => {
  const rows = await db.setting.findMany({ where: { key: { in: [...STOREFRONT_SETTING_KEYS] } } })
  return new Map(rows.map((row: { key: string; value: string }) => [row.key, row.value]))
})
