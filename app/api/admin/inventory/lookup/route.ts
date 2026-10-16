import { requirePermission } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

// Stock count (app/admin/inventory/count): the product a scanned or typed barcode or SKU belongs
// to, with its stock in each location.
export async function GET(req: Request) {
  try {
    await requirePermission('inventory.view')
    const code = String(new URL(req.url).searchParams.get('code') || '').trim().slice(0, 80)
    if (!code) return json({ error: 'Scan or type a barcode' }, { status: 400 })
    const exact = { equals: code, mode: 'insensitive' as const }
    const variant = await db.productVariant.findFirst({ where: { OR: [{ barcode: code }, { sku: exact }] }, select: { id: true, productId: true } })
    const product = variant ? null : await db.product.findFirst({ where: { OR: [{ barcode: code }, { sku: exact }] }, select: { id: true } })
    const productId = variant?.productId || product?.id
    if (!productId) return json({ error: `No product has the code ${code}. Check the product's Barcode or SKU.` }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    const items = await db.inventoryItem.findMany({
      where: { productId, variantId: variant ? variant.id : null },
      select: { id: true, quantity: true, reserved: true, location: { select: { name: true } }, product: { select: { name: true, sku: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: { select: { name: true, sku: true } } },
      orderBy: { quantity: 'desc' },
    })
    if (!items.length) return json({ error: 'This product does not track stock. Turn on "Track inventory" on the product first.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } })
    const first = items[0]
    return json({
      code,
      productId,
      name: first.product.name,
      variant: first.variant?.name && first.variant.name !== 'Default Title' ? first.variant.name : '',
      sku: first.variant?.sku || first.product.sku,
      image: first.product.images[0]?.url || '',
      items: items.map(i => ({ id: i.id, location: i.location?.name || 'Main stock', quantity: i.quantity, reserved: i.reserved })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return routeError(error, 'Unable to look up the code', 400) }
}
