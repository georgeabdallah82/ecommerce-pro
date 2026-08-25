import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ReviewsAdminShopify from '@/components/reviews-admin-shopify'

const css = `.reviewsAdminPage{max-width:1400px;margin:0 auto}.ratingStars{letter-spacing:1px}.reviewSnippet{max-width:480px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.iconTextBtn{display:inline-flex;align-items:center;gap:6px;border:0;background:none;cursor:pointer;font:inherit}.iconTextBtn:disabled{opacity:.55;cursor:default}@media(max-width:700px){.reviewSnippet{max-width:260px}}`

export default async function Reviews() {
  await requirePermission('reviews.view')
  const rows = await db.review.findMany({ include: { product: true, user: true }, orderBy: { createdAt: 'desc' } })
  return <><style dangerouslySetInnerHTML={{ __html: css }} /><ReviewsAdminShopify initial={JSON.parse(JSON.stringify(rows))} /></>
}
