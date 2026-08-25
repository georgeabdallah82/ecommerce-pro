import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { ContentAdminShopify } from '@/components/content-admin-shopify'

export default async function Content() {
  await requirePermission('content.view')
  const rows = await db.homepageBlock.findMany({ orderBy: { sortOrder: 'asc' } })
  return <ContentAdminShopify initial={JSON.parse(JSON.stringify(rows))} />
}
