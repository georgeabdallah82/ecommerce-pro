import { db } from '@/lib/prisma'

// The parts of a Prisma client (or transaction client) these checks need.
type Client = Pick<typeof db, 'product' | 'productVariant'>

/** Empty barcodes are stored as null so they never collide with each other. */
export function cleanBarcode(value: unknown): string | null {
  const text = value == null ? '' : String(value).trim().slice(0, 120)
  return text || null
}

/**
 * Checks a product's SKU, barcode and URL handle against other products. Returns a message
 * naming the clashing field, or null when all are free. Barcode uniqueness lives here (not in
 * a database unique index) because MongoDB treats every missing barcode as the same value.
 */
export async function productConflict(client: Client, fields: { sku?: string; barcode?: string | null; slug?: string }, excludeId?: string): Promise<string | null> {
  const notSelf = excludeId ? { NOT: { id: excludeId } } : {}
  if (fields.sku && await client.product.findFirst({ where: { sku: fields.sku, ...notSelf }, select: { id: true } })) return `SKU "${fields.sku}" is already used by another product.`
  if (fields.barcode && await client.product.findFirst({ where: { barcode: fields.barcode, ...notSelf }, select: { id: true } })) return `Barcode "${fields.barcode}" is already used by another product.`
  if (fields.slug && await client.product.findFirst({ where: { slug: fields.slug, ...notSelf }, select: { id: true } })) return `The URL handle "${fields.slug}" is already used by another product.`
  return null
}

/**
 * Same check for a set of variants about to be saved on one product. `productVariantIds` are
 * the product's current variants, which the save may replace, so they never count as clashes.
 */
export async function variantConflict(client: Client, variants: { id?: string | null; sku: string; barcode: string | null }[], productVariantIds: string[] = []): Promise<string | null> {
  const ownIds = [...productVariantIds, ...variants.map(v => v.id).filter((id): id is string => Boolean(id))]
  const notOwn = ownIds.length ? { NOT: { id: { in: ownIds } } } : {}
  const skus = variants.map(v => v.sku).filter(Boolean)
  if (skus.length) {
    const taken = await client.productVariant.findFirst({ where: { sku: { in: skus }, ...notOwn }, select: { sku: true } })
    if (taken) return `Variant SKU "${taken.sku}" is already used by another product.`
  }
  const barcodes = variants.map(v => v.barcode).filter((b): b is string => Boolean(b))
  if (barcodes.length) {
    const taken = await client.productVariant.findFirst({ where: { barcode: { in: barcodes }, ...notOwn }, select: { barcode: true } })
    if (taken) return `Variant barcode "${taken.barcode}" is already used by another product.`
  }
  return null
}

/** Picks a free URL handle for a new product: "red-mug", then "red-mug-2", "red-mug-3"... */
export async function freeProductSlug(client: Client, base: string): Promise<string> {
  for (let n = 1; n <= 20; n += 1) {
    const candidate = n === 1 ? base : `${base.slice(0, 190)}-${n}`
    if (!(await client.product.findFirst({ where: { slug: candidate }, select: { id: true } }))) return candidate
  }
  return `${base.slice(0, 180)}-${Date.now()}`
}

/** Turns a database unique-constraint error into a message that says which field clashed. */
export function uniqueConflictMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : ''
  if (!message.includes('Unique constraint')) return null
  const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? message)
  if (/barcode/i.test(target)) return 'That barcode is already used by another product.'
  if (/slug/i.test(target)) return 'That URL handle is already used by another product.'
  if (/sku/i.test(target)) return 'That SKU is already used by another product or variant.'
  return 'A product with the same unique value already exists.'
}
