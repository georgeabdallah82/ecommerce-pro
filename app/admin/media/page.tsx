import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import MediaAdminPro from '@/components/media-admin-pro'

const css=`.mediaProPage{max-width:1480px;margin:0 auto}.mediaToolbar{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:12px;margin-bottom:16px}.mediaSearch{display:flex;align-items:center;gap:8px;border:1px solid #e1e3df;background:#fff;border-radius:10px;padding:0 12px;min-height:44px;flex:1;max-width:640px}.mediaSearch input{border:0;outline:0;width:100%;font:inherit}.mediaGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.mediaCard{border:1px solid #e5e5df;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.03)}.mediaThumb{aspect-ratio:1;background:#f5f5f1;display:grid;place-items:center;overflow:hidden}.mediaThumb img{width:100%;height:100%;object-fit:cover}.mediaMeta{padding:12px;display:grid;gap:5px}.mediaMeta strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mediaMeta span{font-size:11px}.mediaMeta .inline{margin-top:5px}.mediaModal{width:min(520px,92vw);padding:24px;display:grid;gap:14px}.mediaListThumb{width:52px;height:52px;border-radius:8px;overflow:hidden;background:#f5f5f1}.mediaListThumb img{width:100%;height:100%;object-fit:cover}.mediaEmpty{padding:48px;display:grid;place-items:center;gap:8px;text-align:center}@media(max-width:1200px){.mediaGrid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:900px){.mediaGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:650px){.mediaToolbar{align-items:stretch;flex-direction:column}.mediaSearch{max-width:none}.mediaGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}`

export default async function Media(){
  await requirePermission('media.view')
  const rows = await db.mediaAsset.findMany({orderBy:{createdAt:'desc'}})
  return <><style dangerouslySetInnerHTML={{__html:css}}/><MediaAdminPro initial={JSON.parse(JSON.stringify(rows))}/></>
}
