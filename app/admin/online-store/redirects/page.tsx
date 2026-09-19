import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import RedirectsAdmin from '@/components/redirects-admin'

export default async function Redirects() {
  await requirePermission('content.view')
  const rows = await db.redirect.findMany({ orderBy: { createdAt: 'desc' } })
  return <RedirectsAdmin initial={JSON.parse(JSON.stringify(rows))} />
}
