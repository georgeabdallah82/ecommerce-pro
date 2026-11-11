import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import MediaAdminPro from '@/components/media-admin-pro'

// The first page of the library. The rest loads on request (app/api/admin/media).
const PAGE = 48

export default async function Media(){
  await requirePermission('media.view')
  const [rows, total] = await Promise.all([
    db.mediaAsset.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE }),
    db.mediaAsset.count(),
  ])
  return <MediaAdminPro initial={JSON.parse(JSON.stringify(rows))} total={total}/>
}
