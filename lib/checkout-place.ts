import { cleanPin, pinFitsCountry, type LocationPin } from '@/lib/location-pin'

// Where an unfinished checkout's shopper is (app/api/checkout/progress): the town and area they typed,
// and the exact spot if they tapped "Share my exact location". Read defensively: anything unexpected
// is dropped, and an empty box never erases what was saved before.

export type CheckoutPlace = { city: string; area: string; pin: LocationPin | null }

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function cleanCheckoutPlace(body: { city?: unknown; area?: unknown; pin?: unknown } | null | undefined, countryCode: string): CheckoutPlace {
  const raw = body && typeof body.pin === 'object' ? (body.pin as Record<string, unknown> | null) : null
  const pin = cleanPin(raw)
  return {
    city: text(body?.city, 60),
    area: text(body?.area, 60),
    pin: pin && pinFitsCountry(pin, countryCode) ? pin : null,
  }
}

// "Jounieh, Keserwan": the town and area for the lists ("" when neither was typed).
export function placeLine(row: { city?: string | null; area?: string | null }) {
  const city = (row.city || '').trim()
  const area = (row.area || '').trim()
  if (city && area && city.toLowerCase() !== area.toLowerCase()) return `${city}, ${area}`
  return city || area
}
