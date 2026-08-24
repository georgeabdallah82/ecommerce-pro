import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ShippingAdminPro from '@/components/shipping-admin-pro'

export default async function Shipping() {
  await requirePermission('shipping.view')
  const initial = await db.shippingZone.findMany({ include: { rates: true }, orderBy: { name: 'asc' } })
  return <ShippingAdminPro initial={JSON.parse(JSON.stringify(initial))} />
}
