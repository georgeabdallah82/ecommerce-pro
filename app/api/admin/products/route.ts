import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('products.view')
    const params = new URL(req.url).searchParams
    const q = params.get('q')?.trim() || ''
    const status = params.get('status')?.trim() || 'ALL'
    const categoryId = params.get('categoryId')?.trim() || 'ALL'
    const sort = params.get('sort')?.trim() || 'updated_desc'
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(100, Math.max(12, Number(params.get('pageSize') || 25)))

    const where: any = {
      ...(status !== 'ALL' ? { status } : {}),
      ...(categoryId !== 'ALL' ? { categoryId } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }

    const orderBy = sort === 'name_asc' ? { name: 'asc' as const }
      : sort === 'name_desc' ? { name: 'desc' as const }
      : sort === 'price_asc' ? { basePrice: 'asc' as const }
      : sort === 'price_desc' ? { basePrice: 'desc' as const }
      : sort === 'created_desc' ? { createdAt: 'desc' as const }
      : { updatedAt: 'desc' as const }

    const [total, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({ where, include: { category: true, inventory: true, variants: { include: { inventory: true } }, images: true, collections: { include: { collection: true } } }, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ])

    return json({ rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const b = await req.json()

    if (b.action === 'bulk') {
      const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x: unknown) => String(x)).filter(Boolean))] : []
      if (!ids.length) return json({ error: 'Select at least one product' }, { status: 400 })
      const action = String(b.bulkAction || '')
      const data: any = {}
      if (action === 'ACTIVE' || action === 'DRAFT' || action === 'ARCHIVED') {
        data.status = action
        data.publishedAt = action === 'ACTIVE' ? new Date() : null
      } else if (action === 'FEATURED_ON') data.featured = true
      else if (action === 'FEATURED_OFF') data.featured = false
      else return json({ error: 'Unsupported bulk action' }, { status: 400 })

      const result = await db.product.updateMany({ where: { id: { in: ids } }, data })
      await audit(actor.id, 'product.bulk_updated', 'Product', undefined, { ids, action, count: result.count })
      return json({ ok: true, count: result.count })
    }

    const name = String(b.name || '').trim()
    const sku = String(b.sku || '').trim()
    if (!name || !sku) return json({ error: 'Name and SKU are required' }, { status: 400 })
    const tags: string[] = Array.isArray(b.tags) ? Array.from(new Set<string>(b.tags.map((x: unknown) => String(x).trim()).filter((x: string) => x.length > 0))) : []
    const images = Array.isArray(b.images) ? b.images.map((x: any, i: number) => ({ url: String(x?.url || x), alt: x?.alt ? String(x.alt) : null, sortOrder: i })) : []
    const variants = Array.isArray(b.variants) ? b.variants : []
    const sharedPool = variants.length > 0 && b.sharedInventory === true

    const p = await db.product.create({ data: {
      name, slug: slugify(String(b.slug || name)) || `product-${Date.now()}`, sku,
      brand: b.brand || null, vendor: b.vendor || null, productType: b.productType || null,
      description: b.description || null, shortDescription: b.shortDescription || null,
      basePrice: Math.max(0, Math.trunc(Number(b.basePrice) || 0)),
      compareAtPrice: b.compareAtPrice !== undefined && b.compareAtPrice !== null && b.compareAtPrice !== '' ? Math.trunc(Number(b.compareAtPrice)) : null,
      costPrice: b.costPrice !== undefined && b.costPrice !== null && b.costPrice !== '' ? Math.trunc(Number(b.costPrice)) : null,
      status: b.status || 'DRAFT', featured: Boolean(b.featured), categoryId: b.categoryId || null,
      seoTitle: b.seoTitle || null, seoDescription: b.seoDescription || null, seoImageUrl: b.seoImageUrl || null,
      weight: b.weight !== undefined && b.weight !== '' ? Number(b.weight) : null, weightUnit: b.weightUnit || null,
      requiresShipping: b.requiresShipping !== false, taxable: b.taxable !== false, trackInventory: b.trackInventory !== false,
      continueSellingWhenOutOfStock: Boolean(b.continueSellingWhenOutOfStock), giftCard: Boolean(b.giftCard),
      salesChannelsJson: b.salesChannelsJson ? String(b.salesChannelsJson) : JSON.stringify(['online_store']),
      productTemplate: b.productTemplate ? String(b.productTemplate) : 'product',
      publishedAt: b.status === 'ACTIVE' ? (b.publishedAt ? new Date(b.publishedAt) : new Date()) : null,
      images: { create: images },
      inventory: { create: { quantity: Math.max(0, Math.trunc(Number(b.quantity) || 0)), lowStockThreshold: Math.max(0, Math.trunc(Number(b.lowStockThreshold) || 5)), location: b.location || 'Main' } },
      tags: { create: tags.map((value: string) => ({ value })) },
      variants: { create: variants.map((v: any) => ({
        name: String(v.name || 'Default Title'), sku: String(v.sku || `${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`),
        barcode: v.barcode ? String(v.barcode) : null, optionJson: typeof v.optionJson === 'string' ? v.optionJson : JSON.stringify(v.options || {}),
        price: v.price !== undefined && v.price !== '' ? Math.trunc(Number(v.price)) : null,
        compareAtPrice: v.compareAtPrice !== undefined && v.compareAtPrice !== '' ? Math.trunc(Number(v.compareAtPrice)) : null,
        weight: v.weight !== undefined && v.weight !== '' ? Number(v.weight) : null, weightUnit: v.weightUnit || null,
        ...(!sharedPool ? { inventory: { create: { quantity: Math.max(0, Math.trunc(Number(v.quantity) || 0)), lowStockThreshold: Math.max(0, Math.trunc(Number(v.lowStockThreshold) || 5)), location: v.location || 'Main' } } } : {})
      })) }
    } })

    await audit(actor.id, 'product.created', 'Product', p.id, { name: p.name, sharedInventory: sharedPool })
    return json({ product: p }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create product' }, { status: 400 }) }
}
