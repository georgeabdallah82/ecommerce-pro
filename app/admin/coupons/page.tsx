import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CouponsAdminPro from '@/components/coupons-admin-pro'

export default async function Coupons() {
  await requirePermission('coupons.view')
  const initial = await db.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  return <CouponsAdminPro initial={JSON.parse(JSON.stringify(initial))} />
}
