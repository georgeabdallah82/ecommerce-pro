import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    const searchParams = new URL(req.url).searchParams
    const q = searchParams.get('q')?.trim() || ''
    const slug = searchParams.get('slug')?.trim() || ''
    const id = searchParams.get('id')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''

    if (id) {
      const product = await db.product.findFirst({
        where: { id, status: 'ACTIVE' },
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { include: { inventory: true } },
          inventory: { where: { variantId: null } },
          tags: true,
        },
      })

      if (!product) {
        return json({ error: 'Product not found' }, { status: 404 })
      }

      return json(product)
    }

    if (slug) {
      const product = await db.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { include: { inventory: true } },
          inventory: { where: { variantId: null } },
          tags: true,
        },
      })

      if (!product) {
        return json({ error: 'Product not found' }, { status: 404 })
      }

      return json(product)
    }

    const where: any = {
      status: 'ACTIVE',
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
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { include: { inventory: true } },
        inventory: { where: { variantId: null } },
        tags: true,
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })

    return json(products)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Unable to load products' },
      { status: 500 }
    )
  }
}
