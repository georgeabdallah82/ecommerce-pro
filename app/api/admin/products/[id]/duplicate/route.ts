import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json, slugify } from '@/lib/utils'

function uniqueText(value: string, suffix: string) {
  return slugify(`${value}-${suffix}`) || `${slugify(value) || 'product'}-${Date.now()}`
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('products.manage')
    const { id } = await params
    const source = await db.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { include: { inventory: true } },
        tags: true,
        metafields: true,
      },
    })
    if (!source) return json({ error: 'Product not found' }, { status: 404 })

    const suffix = `copy-${Date.now().toString(36)}`
    const duplicate = await db.$transaction(async tx => {
      const product = await tx.product.create({
        data: {
          name: `${source.name} (copy)`,
          slug: uniqueText(source.slug, suffix),
          description: source.description,
          shortDescription: source.shortDescription,
          brand: source.brand,
          vendor: source.vendor,
          productType: source.productType,
          basePrice: source.basePrice,
          compareAtPrice: source.compareAtPrice,
          costPrice: source.costPrice,
          sku: `${source.sku}-COPY-${Date.now().toString(36).toUpperCase()}`,
          barcode: null,
          status: 'DRAFT',
          featured: false,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
          seoImageUrl: source.seoImageUrl,
          weight: source.weight,
          weightUnit: source.weightUnit,
          requiresShipping: source.requiresShipping,
          taxable: source.taxable,
          trackInventory: source.trackInventory,
          continueSellingWhenOutOfStock: source.continueSellingWhenOutOfStock,
          giftCard: source.giftCard,
          salesChannelsJson: source.salesChannelsJson,
          productTemplate: source.productTemplate,
          publishedAt: null,
          categoryId: source.categoryId,
          images: {
            create: source.images.map(image => ({ url: image.url, alt: image.alt, sortOrder: image.sortOrder })),
          },
          tags: {
            create: source.tags.map(tag => ({ value: tag.value })),
          },
          inventory: {
            create: {
              quantity: 0,
              reserved: 0,
              lowStockThreshold: source.variants.length ? 5 : (source.tags.length ? 5 : 5),
              location: 'Main',
            },
          },
          variants: {
            create: source.variants.map((variant, index) => ({
              name: variant.name,
              sku: `${variant.sku}-COPY-${index + 1}-${Date.now().toString(36).toUpperCase()}`,
              barcode: null,
              optionJson: variant.optionJson,
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              weight: variant.weight,
              weightUnit: variant.weightUnit,
              inventory: source.variants.length && source.variants.every(v => v.inventory.length > 0)
                ? { create: { quantity: 0, reserved: 0, lowStockThreshold: variant.inventory[0]?.lowStockThreshold ?? 5, location: variant.inventory[0]?.location || 'Main' } }
                : undefined,
            })),
          },
        },
      })

      if (source.metafields.length) {
        await tx.metafieldValue.createMany({
          data: source.metafields.map(value => ({
            definitionId: value.definitionId,
            ownerType: 'PRODUCT',
            ownerId: product.id,
            value: value.value,
          })),
        })
      }
      return product
    })

    await audit(actor.id, 'product.duplicated', 'Product', duplicate.id, {
      sourceProductId: source.id,
      sourceSku: source.sku,
    })

    return json({ product: duplicate }, { status: 201 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to duplicate product' }, { status: 400 })
  }
}
