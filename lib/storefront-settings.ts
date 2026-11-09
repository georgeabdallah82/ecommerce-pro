import { cache } from 'react'
import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'

// Every storefront page needs the theme, menu, tracking pixels and SEO defaults. They used to
// be read with separate queries (layout, metadata and page each asking again), each one a
// round trip to the database. This reads them all in one query, once per page render
// (React cache scopes it to a single request); shoppers who aren't signed in share the rows
// for up to 30 seconds (lib/storefront-cache.ts).
export const STOREFRONT_SETTING_KEYS = [
  'theme.config', 'theme.sections', 'navigation.main',
  'tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId', 'tracking.googleAdsId', 'tracking.googleAdsPurchaseLabel',
  'seo.title', 'seo.description', 'seo.image', 'store.name',
  // For the default search description (lib/seo.ts) when the merchant hasn't written one.
  'store.country', 'store.currency', 'checkout.freeShippingThreshold', 'payment.cod', 'returns.enabled',
  // The notification popup (components/push-opt-in.tsx): on unless switched off in Push campaigns.
  'push.askVisitors',
  // The home-screen app icon (lib/app-icon.ts, app/manifest.ts).
  'app.icon512', 'app.icon192',
] as const

export const getStorefrontSettings = cache(async (): Promise<Map<string, string>> => {
  const rows = await storefrontCached('storefront-settings', () =>
    db.setting.findMany({ where: { key: { in: [...STOREFRONT_SETTING_KEYS] } }, select: { key: true, value: true } }))
  return new Map(rows.map((row: { key: string; value: string }) => [row.key, row.value]))
})
