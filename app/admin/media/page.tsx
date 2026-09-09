import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import MediaAdminPro from '@/components/media-admin-pro'

export default async function Media(){
  await requirePermission('media.view')
  const rows = await db.mediaAsset.findMany({orderBy:{createdAt:'desc'}})
  return <MediaAdminPro initial={JSON.parse(JSON.stringify(rows))}/>
}
