import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductEditorV2 from '@/components/product-editor-v2'
import ui from '@/components/admin-ui.module.css'

type ProductEditPageProps = { params: Promise<{ id: string }> }

export default async function ProductEdit({ params }: ProductEditPageProps) {
  await requirePermission('products.view')
  const { id } = await params
  const [product, categories, definitions, locations] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { include: { inventory: { include: { location: true } } } },
        inventory: { where: { variantId: null }, include: { location: true } },
        tags: true,
        metafields: { include: { definition: true } },
      },
    }),
    db.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.metafieldDefinition.findMany({ where: { ownerType: 'PRODUCT' }, orderBy: [{ namespace: 'asc' }, { key: 'asc' }] }),
    db.storeLocation.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
  ])

  if (!product) return <div className={ui.empty}>Product not found.</div>

  const sharedInventory = product.variants.length > 0 && product.variants.every(v => v.inventory.length === 0) && product.inventory.length > 0
  const serializedProduct = JSON.parse(JSON.stringify({ ...product, sharedInventory }))
  const serializedCategories = JSON.parse(JSON.stringify(categories))
  const serializedDefinitions = JSON.parse(JSON.stringify(definitions))
  const serializedLocations = JSON.parse(JSON.stringify(locations))

  return <ProductEditorV2 initial={serializedProduct} creating={false} categories={serializedCategories} definitions={serializedDefinitions} locations={serializedLocations} />
}
