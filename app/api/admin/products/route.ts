import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('products.view')
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const rows = await db.product.findMany({ where: q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { slug: { contains: q } }] } : undefined, include: { category: true, inventory: true, images: true }, orderBy: { updatedAt: 'desc' } })
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const b = await req.json()
    const name = String(b.name || '').trim(); const sku = String(b.sku || '').trim()
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
