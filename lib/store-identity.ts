import { getStorefrontSettings } from '@/lib/storefront-settings'
import { getThemeState } from '@/lib/theme'

// The store's display name (the brand set in the theme studio wins over Settings › Store name,
// matching the storefront and SEO) and its country, for messages sent to customers.
export async function getStoreIdentity() {
  const [map, themeState] = await Promise.all([
    getStorefrontSettings().catch(() => new Map<string, string>()),
    getThemeState().catch(() => null),
  ])
  const name = String(themeState?.theme?.brandName || map.get('store.name') || process.env.NEXT_PUBLIC_BRAND_NAME || 'Our store').replace(/\s+/g, ' ').trim()
  return { name, country: map.get('store.country') || 'Lebanon' }
}
