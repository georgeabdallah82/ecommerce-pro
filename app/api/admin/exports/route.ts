import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'

const esc = (value: unknown) => { const s = value == null ? '' : String(value); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe }
const csv = (headers: string[], rows: unknown[][]) => [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n') + '\r\n'

export async function GET(request: Request) {
  try {
    const actor = await requirePermission('reports.view')
    const url = new URL(request.url); const type = url.searchParams.get('type') || 'products'
    const ids = url.searchParams.getAll('id').slice(0, 10000); const categoryId = url.searchParams.get('categoryId') || undefined; const collectionId = url.searchParams.get('collectionId') || undefined
    let body = ''; let filename = ''
    if (type === 'products') {
      const products = await db.product.findMany({ where: { ...(ids.length ? { id: { in: ids } } : {}), ...(categoryId ? { categoryId } : {}), ...(collectionId ? { collections: { some: { collectionId } } } : {}) }, include: { category: true, collections: { include: { collection: true }, orderBy: { sortOrder: 'asc' } }, tags: true, inventory: true, variants: { include: { inventory: true } } }, orderBy: { name: 'asc' }, take: 10000 })
      // Every row carries the full product record (whether it's the product's own row or one of
      // its variants' rows) so each line is independently readable -- import only ever treats a
      // row's product-level fields as authoritative when variantOf is blank (see imports/route.ts).
      const productFields = (p: (typeof products)[number]) => [p.id, p.sku, p.name, p.slug, p.description, p.shortDescription, p.brand, p.vendor, p.productType, p.basePrice, p.compareAtPrice, p.costPrice, p.barcode, p.status, p.featured, p.seoTitle, p.seoDescription, p.seoImageUrl, p.weight, p.weightUnit, p.requiresShipping, p.taxable, p.trackInventory, p.continueSellingWhenOutOfStock, p.giftCard, p.category?.slug, p.collections.map(c => c.collection.slug).join('|'), p.tags.map(t => t.value).join('|')]
      const variantOptionsString = (optionJson: string) => { try { const opts = JSON.parse(optionJson || '{}') as Record<string, unknown>; return Object.entries(opts).map(([k, v]) => `${k}:${v}`).join('|') } catch { return '' } }
      const rows: unknown[][] = []
      for (const p of products) {
        const sharedInventory = p.inventory.filter(i => !i.variantId)
        rows.push([...productFields(p), sharedInventory.reduce((s, i) => s + i.quantity, 0), sharedInventory[0]?.lowStockThreshold ?? 5, '', '', '', '', '', '', '', '', ''])
        for (const v of p.variants) {
          const vQty = v.inventory.reduce((s, i) => s + i.quantity, 0)
          rows.push([...productFields(p), '', '', p.sku, v.sku, v.name, v.barcode, variantOptionsString(v.optionJson), v.price, v.compareAtPrice, vQty, v.inventory[0]?.lowStockThreshold ?? 5])
        }
      }
      body = csv(['id','sku','name','slug','description','shortDescription','brand','vendor','productType','basePrice','compareAtPrice','costPrice','barcode','status','featured','seoTitle','seoDescription','seoImageUrl','weight','weightUnit','requiresShipping','taxable','trackInventory','continueSellingWhenOutOfStock','giftCard','categorySlug','collectionSlugs','tags','quantity','lowStockThreshold','variantOf','variantSku','variantName','variantBarcode','variantOptions','variantPrice','variantCompareAtPrice','variantQuantity','variantLowStockThreshold'], rows); filename = 'products.csv'
    } else if (type === 'categories') {
      const categories = await db.category.findMany({ where: ids.length ? { id: { in: ids } } : {}, include: { parent: true }, orderBy: { name: 'asc' }, take: 5000 })
      body = csv(['id','name','slug','description','imageUrl','isActive','sortOrder','parentSlug'], categories.map(c => [c.id,c.name,c.slug,c.description,c.imageUrl,c.isActive,c.sortOrder,c.parent?.slug])); filename = 'categories.csv'
    } else if (type === 'collections') {
      const collections = await db.collection.findMany({ where: ids.length ? { id: { in: ids } } : {}, include: { products: { include: { product: { select: { sku: true } } }, orderBy: { sortOrder: 'asc' } } }, orderBy: { name: 'asc' }, take: 5000 })
      body = csv(['id','name','slug','description','imageUrl','isActive','sortOrder','productSkus'], collections.map(c => [c.id,c.name,c.slug,c.description,c.imageUrl,c.isActive,c.sortOrder,c.products.map(p => p.product.sku).join('|')])); filename = 'collections.csv'
    } else return NextResponse.json({ error: 'Unsupported export type' }, { status: 400 })
    await db.auditLog.create({ data: { actorId: actor.id, action: 'ADMIN_EXPORT', entity: type, metadataJson: JSON.stringify({ ids: ids.length, categoryId, collectionId, rowCount: body.split('\n').length - 2 }) } })
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' } })
  } catch (error) { const message = error instanceof Error ? error.message : 'UNAUTHORIZED'; return NextResponse.json({ error: message === 'FORBIDDEN' ? 'Forbidden' : 'Unauthorized' }, { status: message === 'FORBIDDEN' ? 403 : 401 }) }
}
