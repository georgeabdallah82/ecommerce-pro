import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CollectionsAdminShopify from '@/components/collections-admin-shopify'

export default async function Collections(){
  await requirePermission('collections.view')
  const rows=await db.collection.findMany({include:{_count:{select:{products:true}}},orderBy:[{sortOrder:'asc'},{updatedAt:'desc'}]})
  return <CollectionsAdminShopify initial={JSON.parse(JSON.stringify(rows))}/>
}
