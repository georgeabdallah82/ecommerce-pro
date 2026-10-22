// "Share my exact location" at checkout: the customer taps a button, their phone gives its position,
// and the driver's map button opens that exact spot instead of searching the typed address.
// The position is saved with the order's delivery address (shippingAddressJson) as lat / lng /
// locationAccuracy (metres). Nothing here is shown to other customers.

export type LocationPin = { lat: number; lng: number; accuracy: number | null }

// A pin from another country than the one the customer is ordering to is almost always somebody
// abroad ordering for family, so it is dropped (the typed address is used). Only countries listed
// here are checked; anywhere else the pin is kept as given.
const BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  LB: { minLat: 33.0, maxLat: 34.75, minLng: 35.0, maxLng: 36.7 },
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

// About 1 metre of precision is plenty, and keeps the saved address short.
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

// A usable pin from anything a request or a saved address might hold; null when it is missing or
// not a real position (0,0 is the "no fix" value some phones give).
export function cleanPin(raw: { lat?: unknown; lng?: unknown; locationAccuracy?: unknown; accuracy?: unknown } | null | undefined): LocationPin | null {
  if (!raw) return null
  const lat = asNumber(raw.lat), lng = asNumber(raw.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  const accuracy = asNumber(raw.locationAccuracy ?? raw.accuracy)
  return { lat: round5(lat), lng: round5(lng), accuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? Math.round(accuracy) : null }
}

export function pinFitsCountry(pin: LocationPin, countryCode: string) {
  const box = BOUNDS[String(countryCode || '').toUpperCase()]
  return !box || (pin.lat >= box.minLat && pin.lat <= box.maxLat && pin.lng >= box.minLng && pin.lng <= box.maxLng)
}

// The address as it is saved with the order: the pin kept only when it is real and in the
// delivery country, and removed otherwise.
export function addressWithPin<T extends Record<string, unknown>>(address: T, countryCode: string): T {
  const { lat: _lat, lng: _lng, locationAccuracy: _accuracy, ...rest } = address
  const pin = cleanPin(address)
  if (!pin || !pinFitsCountry(pin, countryCode)) return rest as unknown as T
  return { ...rest, lat: pin.lat, lng: pin.lng, ...(pin.accuracy !== null ? { locationAccuracy: pin.accuracy } : {}) } as unknown as T
}

// The pin saved in an order's delivery address, if the customer shared one.
export const pinFromAddress = (address: Record<string, unknown> | null | undefined) => cleanPin(address)

// Opens that exact spot in Google Maps (the app on a phone).
export const pinMapUrl = (pin: Pick<LocationPin, 'lat' | 'lng'>) => `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`
