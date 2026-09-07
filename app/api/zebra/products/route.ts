import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  basePrice: true,
  costPrice: true,
  category: { select: { name: true } },
  inventory: {
    select: { quantity: true, reserved: true, location: true },
  },
} as const

function authorized(req: Request) {
  const expected = process.env.ZEBRA_API_KEY?.trim()
  if (!expected) return false
  return req.headers.get('x-zebra-api-key') === expected
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = new URL(req.url).searchParams
    const q = params.get('q')?.trim() || ''
    if (!q || q.length > 100) return json({ error: 'Invalid product query' }, { status: 400 })

    const products = await db.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { barcode: { equals: q } },
          { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
          { variants: { some: { barcode: { equals: q } } } },
        ],
      },
      select: PRODUCT_SELECT,
      orderBy: [{ name: 'asc' }],
      take: 50,
    })

    const mapped = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category?.name || 'Uncategorized',
      defaultPrice: p.costPrice ?? p.basePrice,
      sellingPrice: p.basePrice,
      inventory: p.inventory,
    }))

    return json(mapped, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return json({ error: 'Unable to load products' }, { status: 500 })
  }
}
