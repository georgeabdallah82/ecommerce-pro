// Up-front checks for the admin product create/update payloads. Without them a typo'd status or
// a non-numeric price reached the database and came back as a raw Prisma error message.
const STATUSES = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])
const PRODUCT_NUMBERS = ['basePrice', 'compareAtPrice', 'costPrice', 'weight', 'quantity', 'lowStockThreshold'] as const
const VARIANT_NUMBERS = ['price', 'compareAtPrice', 'weight', 'quantity', 'lowStockThreshold'] as const

const isBlank = (value: unknown) => value === undefined || value === null || value === ''
const badNumber = (value: unknown) => !isBlank(value) && !Number.isFinite(Number(value))

export function productInputError(b: any): string | null {
  if (!b || typeof b !== 'object') return 'Invalid product data'
  if (b.status !== undefined && !STATUSES.has(String(b.status))) return 'Status must be Draft, Active or Archived'
  for (const field of PRODUCT_NUMBERS) if (badNumber(b[field])) return `${field} must be a number`
  if (Array.isArray(b.variants)) {
    for (const v of b.variants) for (const field of VARIANT_NUMBERS) if (badNumber(v?.[field])) return `Variant ${field} must be a number`
  }
  return null
}
