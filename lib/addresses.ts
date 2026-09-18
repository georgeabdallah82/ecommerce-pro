export const MAX_ADDRESSES_PER_USER = 20

export type AddressInput = {
  label: string | null
  firstName: string
  lastName: string
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  country: string
  phone: string | null
  isDefault: boolean
}

export function sanitizeAddressInput(b: unknown): AddressInput | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  const body = b as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const firstName = str(body.firstName, 80)
  const lastName = str(body.lastName, 80)
  const line1 = str(body.line1, 200)
  const city = str(body.city, 120)
  const country = str(body.country, 120)
  if (!firstName || !lastName || !line1 || !city || !country) return null
  return {
    label: str(body.label, 60) || null,
    firstName,
    lastName,
    line1,
    line2: str(body.line2, 200) || null,
    city,
    region: str(body.region, 120) || null,
    postalCode: str(body.postalCode, 30) || null,
    country,
    phone: str(body.phone, 40) || null,
    isDefault: Boolean(body.isDefault),
  }
}
