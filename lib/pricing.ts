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

export async function calculateShipping(country: string, subtotalAfterDiscount: number) {
  const zones = await db.shippingZone.findMany({ where: { isActive: true }, include: { rates: { where: { isActive: true }, orderBy: { price: 'asc' } } } })
  const normalizedCountry = country.trim().toUpperCase()
  const upper = normalizedCountry === 'LEBANON' ? 'LB' : normalizedCountry
  const zone = zones.find(z => z.countries === '*' || z.countries.split(',').map(x => x.trim().toUpperCase()).includes(upper))
  const rate = zone?.rates[0]
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
