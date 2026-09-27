import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { Footer } from '@/components/footer'
import AliExpressCart from '@/components/aliexpress-cart'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Cart() {
  const [{ theme }, unpublishedIds] = await Promise.all([getThemeState(), getUnpublishedProductIds()])
  const rawRecommended = await db.product.findMany({
    where: { status: 'ACTIVE', id: { notIn: unpublishedIds } },
    include: { images: true, collections: { include: { collection: true } } },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  })
  const recommended = await withProductStats(rawRecommended)
  return (
    <>
      <AliExpressCart theme={theme} recommended={recommended} />
      <Footer theme={theme} />
    </>
  )
}
