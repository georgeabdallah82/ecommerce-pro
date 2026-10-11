import { routeError } from '@/lib/api-error'
import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { COLLECTION_COLUMNS, PRODUCT_COLUMNS, centsToMoney, statusLabel, toCsv, variantOptionsString, yesNo } from '@/lib/catalog-csv'

const STATUSES = new Set(['ACTIVE', 'DRAFT', 'ARCHIVED'])

// Products › Export and Collections › Export (and their empty templates, ?template=1): a CSV with
// plain column names and prices as money, which Products › Import reads back (lib/catalog-csv.ts).
// Products can be narrowed to chosen ones (?id=…), a collection (?collectionId=), a status
// (?status=) or a search (?q=), the same filters as the Products list, or to SKUs (?sku=…).
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const type = url.searchParams.get('type') || 'products'
    if (type !== 'products' && type !== 'collections') return NextResponse.json({ error: 'Unsupported export type' }, { status: 400 })
    const actor = await requirePermission(type === 'collections' ? 'collections.view' : 'products.view')
    const template = url.searchParams.get('template') === '1'
    const date = new Date().toISOString().slice(0, 10)
    let body: string
    let filename: string
    let count = 0

    if (type === 'products') {
      const headers = PRODUCT_COLUMNS.map(c => c.label)
      filename = template ? 'products-template.csv' : `products-${date}.csv`
      if (template) body = toCsv(headers, [])
      else {
        const ids = url.searchParams.getAll('id').slice(0, 10000)
        // ?sku=…: the backup Products › Import offers of the products a file is about to change.
        const skus = url.searchParams.getAll('sku').slice(0, 1000)
        const collectionId = url.searchParams.get('collectionId') || undefined
        const status = String(url.searchParams.get('status') || '').toUpperCase()
        const q = String(url.searchParams.get('q') || '').trim().slice(0, 120)
        const products = await db.product.findMany({
          where: {
            ...(ids.length ? { id: { in: ids } } : {}),
            ...(skus.length ? { sku: { in: skus } } : {}),
            ...(collectionId ? { collections: { some: { collectionId } } } : {}),
            ...(STATUSES.has(status) ? { status: status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' } : {}),
            ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }, { slug: { contains: q, mode: 'insensitive' as const } }, { vendor: { contains: q, mode: 'insensitive' as const } }, { brand: { contains: q, mode: 'insensitive' as const } }] } : {}),
          },
          include: { collections: { include: { collection: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } }, tags: true, inventory: true, variants: { include: { inventory: true } } },
          orderBy: { name: 'asc' },
          take: 10000,
        })
        count = products.length
        const rows: unknown[][] = []
        for (const p of products) {
          const shared = p.inventory.filter(i => !i.variantId)
          const product: Record<string, unknown> = {
            sku: p.sku, name: p.name, status: statusLabel(p.status), basePrice: centsToMoney(p.basePrice), compareAtPrice: centsToMoney(p.compareAtPrice), costPrice: centsToMoney(p.costPrice),
            quantity: shared.length ? shared.reduce((s, i) => s + i.quantity, 0) : '', lowStockThreshold: shared.length === 1 ? shared[0].lowStockThreshold : '',
            collections: p.collections.map(c => c.collection.name).join(' | '), tags: p.tags.map(t => t.value).join(' | '),
            description: p.description, shortDescription: p.shortDescription, brand: p.brand, vendor: p.vendor, productType: p.productType, barcode: p.barcode, slug: p.slug,
            featured: yesNo(p.featured), trackInventory: yesNo(p.trackInventory), continueSellingWhenOutOfStock: yesNo(p.continueSellingWhenOutOfStock), requiresShipping: yesNo(p.requiresShipping), taxable: yesNo(p.taxable),
            weight: p.weight, weightUnit: p.weightUnit, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImageUrl: p.seoImageUrl, giftCard: yesNo(p.giftCard),
          }
          rows.push(PRODUCT_COLUMNS.map(c => product[c.key] ?? ''))
          // One row per option, under its product: the product's name for reading, its other columns empty.
          for (const v of p.variants) {
            const option: Record<string, unknown> = {
              name: p.name, variantOf: p.sku, variantSku: v.sku, variantName: v.name, variantOptions: variantOptionsString(v.optionJson), variantPrice: centsToMoney(v.price), variantCompareAtPrice: centsToMoney(v.compareAtPrice),
              variantQuantity: v.inventory.length ? v.inventory.reduce((s, i) => s + i.quantity, 0) : '', variantLowStockThreshold: v.inventory.length === 1 ? v.inventory[0].lowStockThreshold : '', variantBarcode: v.barcode,
            }
            rows.push(PRODUCT_COLUMNS.map(c => option[c.key] ?? ''))
          }
        }
        body = toCsv(headers, rows)
        await db.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_EXPORT', entity: 'products', metadataJson: JSON.stringify({ ids: ids.length, skus: skus.length, collectionId, status: STATUSES.has(status) ? status : undefined, q: q || undefined, count }) } })
      }
    } else {
      const headers = COLLECTION_COLUMNS.map(c => c.label)
      filename = template ? 'collections-template.csv' : `collections-${date}.csv`
      if (template) body = toCsv(headers, [])
      else {
        const collections = await db.collection.findMany({ include: { products: { include: { product: { select: { sku: true } } }, orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' }, take: 5000 })
        count = collections.length
        body = toCsv(headers, collections.map(c => {
          const row: Record<string, unknown> = { name: c.name, slug: c.slug, isActive: yesNo(c.isActive), sortOrder: c.sortOrder, productSkus: c.products.map(p => p.product.sku).join(' | '), description: c.description, imageUrl: c.imageUrl }
          return COLLECTION_COLUMNS.map(col => row[col.key] ?? '')
        }))
        await db.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_EXPORT', entity: 'collections', metadataJson: JSON.stringify({ count }) } })
      }
    }
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Row-Count': String(count) } })
  } catch (error) { return routeError(error, 'Export failed', 400) }
}
