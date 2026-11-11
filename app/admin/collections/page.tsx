import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CollectionsAdminShopify from '@/components/collections-admin-shopify'

// The first page of collections, in storefront order. The rest loads on request (app/api/admin/collections).
const PAGE = 50

export default async function Collections(){
  await requirePermission('collections.view')
  const [rows, total, active, inactive] = await Promise.all([
    db.collection.findMany({ include: { _count: { select: { products: true } } }, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }], take: PAGE }),
    db.collection.count(),
    db.collection.count({ where: { isActive: true } }),
    db.collection.count({ where: { isActive: false } }),
  ])
  const page = { rows, total, counts: { all: total, active, inactive } }
  return <CollectionsAdminShopify initial={JSON.parse(JSON.stringify(page))}/>
}
