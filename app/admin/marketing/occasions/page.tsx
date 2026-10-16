import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { OCCASIONS_KEY, readOccasions } from '@/lib/occasions'
import OccasionsAdmin from '@/components/occasions-admin'

export const dynamic = 'force-dynamic'

// Marketing > Occasions (lib/occasions.ts).
export default async function OccasionsPage() {
  const user = await requirePermission('coupons.view')
  const [saved, collections] = await Promise.all([
    db.setting.findUnique({ where: { key: OCCASIONS_KEY }, select: { value: true } }),
    db.collection.findMany({ where: { isActive: true }, select: { name: true, slug: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])
  return <OccasionsAdmin initial={readOccasions(saved?.value)} collections={collections} canEdit={hasPermission(user, 'coupons.manage')} />
}
