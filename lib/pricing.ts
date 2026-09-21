import { db } from '@/lib/prisma'

// The store-wide "Free shipping threshold" setting (Settings > Checkout, stored in
// whole currency units) is the fallback free-shipping cutoff used when no
// ShippingZone/ShippingRate matches the destination -- mirroring how
// getTaxRatePercent below falls back to a flat setting when no TaxRate zone
// matches. A configured ShippingRate.freeAbove always takes priority once a zone
// does match, same as it always did.
export function resolveFreeShippingThresholdCents(settingValue: string | null | undefined) {
  const dollars = Number(settingValue)
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 10000
}

async function matchingZone(country: string) {
  const zones = await db.shippingZone.findMany({ where: { isActive: true }, include: { rates: { where: { isActive: true }, orderBy: { price: 'asc' } } } })
  const normalizedCountry = country.trim().toUpperCase()
  const upper = normalizedCountry === 'LEBANON' ? 'LB' : normalizedCountry
  return zones.find(z => z.countries === '*' || z.countries.split(',').map(x => x.trim().toUpperCase()).includes(upper))
}

export type ShippingRateOption = { id: string | null; name: string; price: number; freeAbove: number | null; estimatedDays: number | null }

// Lets checkout offer every active rate on the matched zone (e.g. Standard + Express),
// rather than only the cheapest -- the admin Shipping Zones UI has always supported adding
// multiple rates per zone, but until this quote endpoint existed nothing ever read past
// rates[0]. Falls back to a single synthetic "Standard delivery" option, priced the same
// way calculateShipping's own no-zone-match branch always has, so the UI always has at
// least one option to show even for an unconfigured country.
export async function listShippingRates(country: string): Promise<ShippingRateOption[]> {
  const zone = await matchingZone(country)
  if (zone && zone.rates.length) return zone.rates.map(r => ({ id: r.id, name: r.name, price: r.price, freeAbove: r.freeAbove, estimatedDays: r.estimatedDays }))
  const setting = await db.setting.findUnique({ where: { key: 'checkout.freeShippingThreshold' } })
  const thresholdCents = resolveFreeShippingThresholdCents(setting?.value)
  return [{ id: null, name: 'Standard delivery', price: 500, freeAbove: thresholdCents, estimatedDays: null }]
}

// rateId, when given, must be one of the currently-active rates on the zone matching
// `country` -- picked by the customer from listShippingRates's response above. A rateId
// that doesn't match (stale quote, tampered request, zone/rate deactivated since the quote
// was fetched) is rejected rather than silently substituted, the same way an invalid coupon
// code is rejected rather than silently ignored. Omitting rateId keeps the original
// behavior (cheapest active rate) for callers that don't offer a picker.
export async function calculateShipping(country: string, subtotalAfterDiscount: number, rateId?: string | null) {
  const zone = await matchingZone(country)
  const rate = rateId ? zone?.rates.find(r => r.id === rateId) : zone?.rates[0]
  if (rateId && !rate) throw new Error('Selected shipping method is no longer available')
  if (!rate) {
    const setting = await db.setting.findUnique({ where: { key: 'checkout.freeShippingThreshold' } })
    const thresholdCents = resolveFreeShippingThresholdCents(setting?.value)
    return { total: subtotalAfterDiscount >= thresholdCents ? 0 : 500, method: 'Standard delivery', estimatedDays: null }
  }
  if (rate.freeAbove !== null && subtotalAfterDiscount >= rate.freeAbove) return { total: 0, method: rate.name, estimatedDays: rate.estimatedDays }
  return { total: rate.price, method: rate.name, estimatedDays: rate.estimatedDays }
}

function clampRate(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

/**
 * Resolves the tax rate percent for a checkout, preferring a TaxRate zone
 * matching the destination country over the store-wide fallback setting.
 * A TaxRate with countries === '*' acts as a configured fallback (taking
 * priority over the legacy flat setting, but not over a country-specific
 * match) -- this lets a store replace the single global rate with real
 * per-country zones without an all-or-nothing cutover.
 */
export async function getTaxRatePercent(country?: string) {
  if (country) {
    const normalized = country.trim().toUpperCase()
    const upper = normalized === 'LEBANON' ? 'LB' : normalized
    const zones = await db.taxRate.findMany({ where: { isActive: true } })
    const specific = zones.find(z => z.countries !== '*' && z.countries.split(',').map(x => x.trim().toUpperCase()).includes(upper))
    if (specific) return clampRate(specific.rate)
    const wildcard = zones.find(z => z.countries === '*')
    if (wildcard) return clampRate(wildcard.rate)
  }
  const setting = await db.setting.findUnique({ where: { key: 'checkout.taxRatePercent' } })
  return clampRate(Number(setting?.value || 0))
}
