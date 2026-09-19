import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import PagesAdmin from '@/components/pages-admin'

export default async function Pages() {
  await requirePermission('content.view')
  const rows = await db.page.findMany({ orderBy: { updatedAt: 'desc' } })
  return <PagesAdmin initial={JSON.parse(JSON.stringify(rows))} />
}
