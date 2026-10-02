import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { Footer } from '@/components/footer'
import AliExpressCart from '@/components/aliexpress-cart'
import { themeTemplates } from '@/lib/theme-templates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Cart has no pre-existing editorTemplates repair/defaults the way Product and
// Collection do (see lib/theme.ts) -- theme.editorTemplates?.Cart is simply
// absent until a merchant adds something via the (future) theme editor UI, so
// this zone is empty by default with no extra logic needed to keep it that way.
const CART_ZONE_EXCLUDE = new Set(['header', 'announcement', 'footer'])

export default async function Cart() {
  const [{ theme }, unpublishedIds] = await Promise.all([getThemeState(), getUnpublishedProductIds()])
  const sections = (themeTemplates(theme).Cart || []).filter((s: any) => s && !CART_ZONE_EXCLUDE.has(s.type))
  const needsCollections = sections.some((s: any) => s.type === 'collection_grid' || s.type === 'collection_carousel')
  const [rawRecommended, zoneCollections] = await Promise.all([
    db.product.findMany({
      where: { status: 'ACTIVE', id: { notIn: unpublishedIds } },
      include: { images: { orderBy: { sortOrder: 'asc' } }, collections: { include: { collection: true } } },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 12,
    }),
    needsCollections ? db.collection.findMany({ where: { isActive: true }, take: 12, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
  ])
  const recommended = await withProductStats(rawRecommended)
  return (
    <>
      <AliExpressCart theme={theme} recommended={recommended} sections={sections} zoneCollections={zoneCollections} />
      <Footer theme={theme} />
    </>
  )
}
