import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductEditor from '@/components/product-editor'

type ProductEditPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ProductEdit({
  params,
}: ProductEditPageProps) {
  await requirePermission('products.view')

  const { id } = await params

  const [product, categories, definitions] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
        variants: {
          include: {
            inventory: true,
          },
        },
        inventory: {
          where: {
            variantId: null,
          },
        },
        tags: true,
        metafields: {
          include: {
            definition: true,
          },
        },
      },
    }),

    db.category.findMany({
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    }),

    db.metafieldDefinition.findMany({
      where: {
        ownerType: 'PRODUCT',
      },
      orderBy: [
        {
          namespace: 'asc',
        },
        {
          key: 'asc',
        },
      ],
    }),
  ])

  if (!product) {
    return (
      <div className="empty">
        Product not found.
      </div>
    )
  }

  const serializedProduct = JSON.parse(
    JSON.stringify(product)
  )

  const serializedCategories = JSON.parse(
    JSON.stringify(categories)
  )

  const serializedDefinitions = JSON.parse(
    JSON.stringify(definitions)
  )

  return (
    <ProductEditor
      initial={serializedProduct}
      creating={false}
      categories={serializedCategories}
      definitions={serializedDefinitions}
    />
  )
}
