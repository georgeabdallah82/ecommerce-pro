import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const publicProductSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  brand: true,
  vendor: true,
  productType: true,
  basePrice: true,
  compareAtPrice: true,
  sku: true,
  status: true,
  featured: true,
  seoTitle: true,
  seoDescription: true,
  seoImageUrl: true,
  weight: true,
  weightUnit: true,
  requiresShipping: true,
  taxable: true,
  trackInventory: true,
  continueSellingWhenOutOfStock: true,
  giftCard: true,
  productTemplate: true,
  publishedAt: true,
  category: {
    select: { id: true, name: true, slug: true, description: true, imageUrl: true },
  },
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      optionJson: true,
      price: true,
      compareAtPrice: true,
      weight: true,
      weightUnit: true,
    },
  },
  tags: { select: { id: true, value: true } },
  collections: {
    select: {
      sortOrder: true,
      collection: { select: { id: true, name: true, slug: true, description: true, imageUrl: true } },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const

async function findPublicProduct(where: Record<string, unknown>) {
  return db.product.findFirst({ where: { ...where, status: 'ACTIVE' }, select: publicProductSelect })
}

export async function GET(req: Request) {
  try {
    const searchParams = new URL(req.url).searchParams
    const q = searchParams.get('q')?.trim() || ''
    const slug = searchParams.get('slug')?.trim() || ''
    const id = searchParams.get('id')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''

    if (id) {
      const product = await findPublicProduct({ id })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product)
    }

    if (slug) {
      const product = await findPublicProduct({ slug })
      if (!product) return json({ error: 'Product not found' }, { status: 404 })
      return json(product)
    }

    const where = {
      status: 'ACTIVE' as const,
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { sku: { contains: q } },
              { description: { contains: q } },
              { shortDescription: { contains: q } },
            ],
          }
        : {}),
    }

    const products = await db.product.findMany({
      where,
      select: publicProductSelect,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })

    return json(products)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to load products' }, { status: 500 })
  }
}
