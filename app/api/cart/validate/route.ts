import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import type { CartLineCheck } from '@/lib/cart-sync'

// Current price and stock for the lines in a shopper's cart (see lib/cart-sync.ts). Uses the
// same rules checkout charges by: variant price over base price, ACTIVE + published only,
// stock = quantity - reserved unless the product sells when out of stock.
export async function POST(req: Request) {
  const limit = consumeRateLimit(`cart-validate:${clientIp(req.headers)}`, 60, 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many requests' }, { status: 429 })
  const body = await req.json().catch(() => null)
  const lines = (Array.isArray(body?.items) ? body.items : []).slice(0, 100)
    .map((x: any) => ({ productId: String(x?.productId || '').slice(0, 100), variantId: x?.variantId ? String(x.variantId).slice(0, 100) : null }))
    .filter((x: { productId: string }) => x.productId)
  if (!lines.length) return json({ items: [] })

  const ids = [...new Set<string>(lines.map((l: { productId: string }) => l.productId))]
  const [unpublishedIds, products] = await Promise.all([
    getUnpublishedProductIds(),
    db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { variants: true, inventory: true } }),
  ])
  const hidden = new Set(unpublishedIds)
  const byId = new Map(products.filter(p => !hidden.has(p.id)).map(p => [p.id, p]))

  const items: CartLineCheck[] = lines.map((line: { productId: string; variantId: string | null }) => {
    const product = byId.get(line.productId)
    if (!product) return { ...line, status: 'unavailable' }
    const variant = line.variantId ? product.variants.find(v => v.id === line.variantId) : null
    if (line.variantId && !variant) return { ...line, status: 'unavailable' }
    let available: number | null = null
    if (product.trackInventory && !product.continueSellingWhenOutOfStock) {
      const dedicated = line.variantId ? product.inventory.filter(x => x.variantId === line.variantId) : []
      const rows = dedicated.length ? dedicated : product.inventory.filter(x => !x.variantId)
      available = Math.max(0, rows.reduce((sum, x) => sum + x.quantity - x.reserved, 0))
    }
    return { ...line, status: 'ok', price: variant?.price ?? product.basePrice, available }
  })
  return json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
