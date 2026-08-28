import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json, slugify } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('products.view')
    const params = new URL(req.url).searchParams
    const q = params.get('q')?.trim() || ''
    const status = params.get('status')?.trim() || 'ALL'
    const categoryId = params.get('categoryId')?.trim() || 'ALL'
    const sort = params.get('sort')?.trim() || 'updated_desc'
    const pageRaw = Number(params.get('page') || 1)
    const pageSizeRaw = Number(params.get('pageSize') || 25)
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(12, Math.floor(pageSizeRaw))) : 25
    const boundedQuery = q.slice(0, 120)
    const where: any = {
      ...(status !== 'ALL' ? { status } : {}),
      ...(categoryId !== 'ALL' ? { categoryId } : {}),
      ...(boundedQuery ? { OR: [{ name: { contains: boundedQuery, mode: 'insensitive' } }, { sku: { contains: boundedQuery, mode: 'insensitive' } }, { slug: { contains: boundedQuery, mode: 'insensitive' } }, { vendor: { contains: boundedQuery, mode: 'insensitive' } }, { brand: { contains: boundedQuery, mode: 'insensitive' } }] } : {}),
    }
    const orderBy = sort === 'name_asc' ? { name: 'asc' as const } : sort === 'name_desc' ? { name: 'desc' as const } : sort === 'price_asc' ? { basePrice: 'asc' as const } : sort === 'price_desc' ? { basePrice: 'desc' as const } : sort === 'created_desc' ? { createdAt: 'desc' as const } : { updatedAt: 'desc' as const }
    const [total, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({ where, include: { category: true, inventory: true, variants: { include: { inventory: true } }, images: true, collections: { include: { collection: true } } }, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return json({ rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500
    if (status === 500) console.error('Admin products GET failed', e)
    return json({ error: status === 500 ? 'Unable to load products' : status === 403 ? 'Forbidden' : 'Unauthorized' }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const b = await req.json()
    if (b.action === 'bulk') {
      const ids: string[] = Array.from(new Set<string>(Array.isArray(b.ids) ? b.ids.map((x: unknown) => String(x).trim().slice(0, 100)).filter((x: string) => Boolean(x)) : []))
      if (!ids.length) return json({ error: 'Select at least one product' }, { status: 400 })
      if (ids.length > 500) return json({ error: 'Too many products selected' }, { status: 400 })
      const action = String(b.bulkAction || '')
      const data: any = {}
      if (action === 'ACTIVE' || action === 'DRAFT' || action === 'ARCHIVED') { data.status = action; data.publishedAt = action === 'ACTIVE' ? new Date() : null }
      else if (action === 'FEATURED_ON') data.featured = true
      else if (action === 'FEATURED_OFF') data.featured = false
      else return json({ error: 'Unsupported bulk action' }, { status: 400 })
      const result = await db.product.updateMany({ where: { id: { in: ids } }, data })
      await audit(actor.id, 'product.bulk_updated', 'Product', undefined, { ids, action, count: result.count })
      return json({ ok: true, count: result.count })
    }

    const name = String(b.name || '').trim().slice(0, 200)
    const sku = String(b.sku || '').trim().slice(0, 120)
    if (!name || !sku) return json({ error: 'Name and SKU are required' }, { status: 400 })
    const tags: string[] = Array.isArray(b.tags) ? Array.from(new Set<string>(b.tags.map((x: unknown) => String(x).trim().slice(0, 80)).filter((x: string) => x.length > 0))).slice(0, 100) : []
    const images: { url: string; alt: string | null; sortOrder: number }[] = Array.isArray(b.images) ? b.images.slice(0, 20).map((x: any, i: number) => ({ url: String(x?.url || x).trim().slice(0, 2000), alt: x?.alt ? String(x.alt).trim().slice(0, 250) : null, sortOrder: i })).filter((x: { url: string }) => Boolean(x.url)) : []
    const variants = Array.isArray(b.variants) ? b.variants.slice(0, 100) : []
    const sharedPool = variants.length > 0 && b.sharedInventory === true
    const variantSkus = new Set<string>(); const variantBarcodes = new Set<string>()
    for (const v of variants) {
      const vs = String(v.sku || '').trim().slice(0, 120)
      if (!vs) return json({ error: 'Every variant needs a SKU' }, { status: 400 })
      if (variantSkus.has(vs) || vs === sku) return json({ error: `Duplicate variant SKU: ${vs}` }, { status: 400 })
      variantSkus.add(vs)
      const vb = v.barcode ? String(v.barcode).trim().slice(0, 120) : ''
      if (vb) { if (variantBarcodes.has(vb)) return json({ error: `Duplicate variant barcode: ${vb}` }, { status: 400 }); variantBarcodes.add(vb) }
    }

    const p = await db.$transaction(async tx => {
      const created = await tx.product.create({ data: {
        name, slug: slugify(String(b.slug || name)).slice(0, 200) || `product-${Date.now()}`, sku,
        brand: b.brand ? String(b.brand).trim().slice(0, 160) : null, vendor: b.vendor ? String(b.vendor).trim().slice(0, 160) : null, productType: b.productType ? String(b.productType).trim().slice(0, 160) : null,
        description: b.description ? String(b.description).slice(0, 20000) : null, shortDescription: b.shortDescription ? String(b.shortDescription).slice(0, 1000) : null,
        basePrice: Math.max(0, Math.trunc(Number(b.basePrice) || 0)), compareAtPrice: b.compareAtPrice !== undefined && b.compareAtPrice !== null && b.compareAtPrice !== '' ? Math.trunc(Number(b.compareAtPrice)) : null, costPrice: b.costPrice !== undefined && b.costPrice !== null && b.costPrice !== '' ? Math.trunc(Number(b.costPrice)) : null,
        status: b.status || 'DRAFT', featured: Boolean(b.featured), categoryId: b.categoryId || null,
        seoTitle: b.seoTitle ? String(b.seoTitle).slice(0, 250) : null, seoDescription: b.seoDescription ? String(b.seoDescription).slice(0, 1000) : null, seoImageUrl: b.seoImageUrl ? String(b.seoImageUrl).slice(0, 2000) : null,
        weight: b.weight !== undefined && b.weight !== '' ? Number(b.weight) : null, weightUnit: b.weightUnit || null,
        requiresShipping: b.requiresShipping !== false, taxable: b.taxable !== false, trackInventory: b.trackInventory !== false, continueSellingWhenOutOfStock: Boolean(b.continueSellingWhenOutOfStock), giftCard: Boolean(b.giftCard),
        salesChannelsJson: b.salesChannelsJson ? String(b.salesChannelsJson).slice(0, 5000) : JSON.stringify(['online_store']), productTemplate: b.productTemplate ? String(b.productTemplate).slice(0, 100) : 'product', publishedAt: b.status === 'ACTIVE' ? (b.publishedAt ? new Date(b.publishedAt) : new Date()) : null,
        images: { create: images },
        inventory: variants.length === 0 || sharedPool ? { create: { quantity: Math.max(0, Math.trunc(Number(b.quantity) || 0)), reserved: 0, lowStockThreshold: Math.max(0, Math.trunc(Number(b.lowStockThreshold) || 5)), location: b.location ? String(b.location).slice(0, 160) : 'Main' } } : undefined,
        tags: { create: tags.map((value: string) => ({ value })) },
      } })

      for (let index = 0; index < variants.length; index += 1) {
        const v = variants[index]
        const variant = await tx.productVariant.create({ data: {
          productId: created.id,
          name: String(v.name || 'Default Title').trim().slice(0, 160),
          sku: String(v.sku).trim().slice(0, 120),
          barcode: v.barcode ? String(v.barcode).trim().slice(0, 120) : null,
          optionJson: typeof v.optionJson === 'string' ? v.optionJson.slice(0, 5000) : JSON.stringify(v.options || {}).slice(0, 5000),
          price: v.price !== undefined && v.price !== '' ? Math.trunc(Number(v.price)) : null,
          compareAtPrice: v.compareAtPrice !== undefined && v.compareAtPrice !== '' ? Math.trunc(Number(v.compareAtPrice)) : null,
          weight: v.weight !== undefined && v.weight !== '' ? Number(v.weight) : null,
          weightUnit: v.weightUnit || null,
        } })
        if (!sharedPool) await tx.inventoryItem.create({ data: { productId: created.id, variantId: variant.id, quantity: Math.max(0, Math.trunc(Number(v.quantity) || 0)), reserved: 0, lowStockThreshold: Math.max(0, Math.trunc(Number(v.lowStockThreshold) || 5)), location: v.location ? String(v.location).slice(0, 160) : 'Main' } })
      }
      return created
    })

    await audit(actor.id, 'product.created', 'Product', p.id, { name: p.name, sharedInventory: sharedPool, variants: variants.length })
    return json({ product: p }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message.includes('Unique constraint')) return json({ error: 'A product, SKU or barcode with the same unique value already exists.' }, { status: 409 })
    if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    if (message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    console.error('Admin products POST failed', e)
    return json({ error: 'Unable to create product' }, { status: 500 })
  }
}
