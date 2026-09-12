import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import TaxAdminPro from '@/components/tax-admin-pro'

export default async function Tax() {
  await requirePermission('tax.view')
  const initial = await db.taxRate.findMany({ orderBy: { name: 'asc' } })
  return <TaxAdminPro initial={JSON.parse(JSON.stringify(initial))} />
}
