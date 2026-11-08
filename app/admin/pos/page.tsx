import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { tillItems, type StockRow, type TillProductInput } from '@/lib/pos-till'
import PosTill from '@/components/pos-till'

// The till: active products and their stock, for scanning and building a cart. Sales are not saved
// yet (docs/erp-pos-architecture.md, phase 4).
export default async function PointOfSalePage() {
  await requirePermission('products.view')
  const [products, stock] = await Promise.all([
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, sku: true, barcode: true, basePrice: true, variants: { select: { id: true, name: true, sku: true, barcode: true, price: true } } },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
    db.inventoryItem.findMany({ select: { productId: true, variantId: true, quantity: true, reserved: true } }),
  ])
  const tillProducts: TillProductInput[] = products.map(product => ({
    id: product.id,
    title: product.name,
    sku: product.sku,
    barcode: product.barcode,
    basePrice: product.basePrice,
    variants: product.variants.map(variant => ({ id: variant.id, title: variant.name, sku: variant.sku, barcode: variant.barcode, price: variant.price })),
  }))
  const items = tillItems(tillProducts, stock satisfies StockRow[])
  return <PosTill items={items} />
}
