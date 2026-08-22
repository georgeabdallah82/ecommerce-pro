import { db } from '@/lib/prisma'

export async function calculateShipping(country: string, subtotalAfterDiscount: number) {
  const zones = await db.shippingZone.findMany({ where: { isActive: true }, include: { rates: { where: { isActive: true }, orderBy: { price: 'asc' } } } })
  const normalizedCountry = country.trim().toUpperCase()
  const upper = normalizedCountry === 'LEBANON' ? 'LB' : normalizedCountry
  const zone = zones.find(z => z.countries === '*' || z.countries.split(',').map(x => x.trim().toUpperCase()).includes(upper))
  const rate = zone?.rates[0]
  if (!rate) return { total: subtotalAfterDiscount >= 10000 ? 0 : 500, method: 'Standard delivery', estimatedDays: null }
  if (rate.freeAbove !== null && subtotalAfterDiscount >= rate.freeAbove) return { total: 0, method: rate.name, estimatedDays: rate.estimatedDays }
  return { total: rate.price, method: rate.name, estimatedDays: rate.estimatedDays }
}

export async function getTaxRatePercent() {
  const setting = await db.setting.findUnique({ where: { key: 'checkout.taxRatePercent' } })
  const parsed = Number(setting?.value || 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
}
