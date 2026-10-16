import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { getSellingConfig } from '@/lib/selling-config'
import { siteUrl } from '@/lib/seo'
import QuestionsAdmin from '@/components/questions-admin'

export const dynamic = 'force-dynamic'

// Admin > Content > Questions: questions shoppers asked on product pages (lib/product-questions.ts).
export default async function QuestionsPage() {
  const user = await requirePermission('reviews.view')
  const [rows, timezone, store, selling] = await Promise.all([
    db.productQuestion.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: { product: { select: { id: true, name: true, slug: true } } } }),
    getStoreTimezone(),
    getStoreIdentity(),
    getSellingConfig().catch(() => null),
  ])
  return <QuestionsAdmin
    initial={JSON.parse(JSON.stringify(rows))}
    timezone={timezone}
    storeName={store.name}
    siteUrl={siteUrl()}
    enabled={selling?.questions !== false}
    canManage={hasPermission(user, 'reviews.manage')}
  />
}
