import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { listShippingRates } from '@/lib/pricing'
import { getThemeState } from '@/lib/theme'
import { normalizeCountry } from '@/lib/countries'
import { parseDeliveryAreas } from '@/lib/storefront-market'
import { getStoreIdentity } from '@/lib/store-identity'

// Public quote endpoint the checkout page calls with the delivery country and area, so it can
// offer the real choice of rates (e.g. Standard vs. Express) for that area -- delivery can cost
// more outside Beirut (lib/pricing.ts pickZone). For the store's own country it also returns the
// delivery areas (Theme settings › Delivery bar), which checkout shows as the "Area" list.
export async function GET(req: Request) {
  const limit = consumeRateLimit(`checkout-shipping-rates:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429 })

  const url = new URL(req.url)
  const country = (url.searchParams.get('country') || '').trim().slice(0, 80)
  const region = (url.searchParams.get('region') || '').trim().slice(0, 100)
  if (!country) return json({ error: 'country is required' }, { status: 400 })

  const [rates, themeState, store] = await Promise.all([
    listShippingRates(country, region || null),
    getThemeState().catch(() => null),
    getStoreIdentity().catch(() => ({ country: 'Lebanon' })),
  ])
  const delivery = (themeState?.theme as any)?.delivery || {}
  const sameCountry = normalizeCountry(country) === normalizeCountry(store.country || 'Lebanon')
  const areas = sameCountry && delivery.enabled !== false ? parseDeliveryAreas(delivery.areas) : []
  return json({ rates, areas })
}
