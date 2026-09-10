import { requirePermission } from '@/lib/auth'
import MetafieldsAdmin from '@/components/metafields-admin'
import { db } from '@/lib/prisma'

export default async function MetafieldsPage(){
 await requirePermission('metafields.view')
 const definitions=await db.metafieldDefinition.findMany({orderBy:[{ownerType:'asc'},{namespace:'asc'},{key:'asc'}]})
 return <MetafieldsAdmin initial={definitions}/>
}
