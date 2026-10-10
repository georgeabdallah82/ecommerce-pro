import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ReviewsAdminShopify from '@/components/reviews-admin-shopify'

export default async function Reviews() {
  await requirePermission('reviews.view')
  const rows = await db.review.findMany({ include: { product: true, user: true }, orderBy: { createdAt: 'desc' }, take: 500 })
  return <ReviewsAdminShopify initial={JSON.parse(JSON.stringify(rows))} />
}
