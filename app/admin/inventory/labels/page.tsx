import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getStoreCurrency } from '@/lib/store-currency'
import BarcodeLabels, { type LabelRow } from '@/components/barcode-labels'

export const dynamic = 'force-dynamic'

// Products > Barcode stickers: one row per product, or per option when options keep their own
// stock. The sticker's code is the one Stock count looks up for that stock: the barcode on the
// box if there is one, otherwise the SKU.
export default async function BarcodeLabelsPage() {
  await requirePermission('inventory.view')
  const [products, currency] = await Promise.all([
    db.product.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: {
        id: true, name: true, sku: true, barcode: true, basePrice: true, status: true,
        variants: { select: { id: true, name: true, sku: true, barcode: true, price: true }, orderBy: { name: 'asc' } },
        inventory: { select: { variantId: true, quantity: true } },
      },
      orderBy: { name: 'asc' },
      take: 2000,
    }),
    getStoreCurrency(),
  ])
  const rows: LabelRow[] = []
  for (const p of products) {
    const stock = new Map<string, number>()
    for (const item of p.inventory) stock.set(item.variantId || '', (stock.get(item.variantId || '') || 0) + item.quantity)
    const realVariants = p.variants.filter(v => v.name !== 'Default Title')
    const variantStock = p.variants.filter(v => stock.has(v.id))
    // Where this product's stock is kept decides which code Stock count needs.
    const perVariant = variantStock.length ? variantStock : !stock.has('') ? realVariants : []
    if (perVariant.length) {
      for (const v of perVariant) rows.push({ key: `${p.id}:${v.id}`, productId: p.id, name: p.name, variant: v.name === 'Default Title' ? '' : v.name, code: v.barcode || v.sku, fromBox: Boolean(v.barcode), price: v.price ?? p.basePrice, stock: Math.max(0, stock.get(v.id) || 0), draft: p.status === 'DRAFT' })
    } else {
      rows.push({ key: `${p.id}:`, productId: p.id, name: p.name, variant: '', code: p.barcode || p.sku, fromBox: Boolean(p.barcode), price: p.basePrice, stock: Math.max(0, stock.get('') || 0), draft: p.status === 'DRAFT' })
    }
  }
  return <BarcodeLabels rows={rows} currency={currency} />
}
