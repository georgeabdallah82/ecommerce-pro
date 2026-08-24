import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CollectionsAdminPro from '@/components/collections-admin-pro'
export default async function Collections(){await requirePermission('collections.view');const rows=await db.collection.findMany({include:{_count:{select:{products:true}}},orderBy:[{sortOrder:'asc'},{updatedAt:'desc'}]});return <CollectionsAdminPro initial={JSON.parse(JSON.stringify(rows))}/>}
