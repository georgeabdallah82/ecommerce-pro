import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { listShippingRates } from '@/lib/pricing'

// Public quote endpoint the checkout page calls once the customer has entered a delivery
// country, so it can offer a real choice between the zone's active rates (e.g. Standard vs.
// Express) instead of always silently charging the cheapest one -- see lib/pricing.ts's
// listShippingRates for why this was needed.
export async function GET(req: Request) {
  const limit = consumeRateLimit(`checkout-shipping-rates:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429 })

  const url = new URL(req.url)
  const country = (url.searchParams.get('country') || '').trim()
  if (!country) return json({ error: 'country is required' }, { status: 400 })

  const rates = await listShippingRates(country)
  return json({ rates })
}
