import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { ContentAdminShopify } from '@/components/content-admin-shopify'

const css = `.contentModal{width:min(720px,92vw);padding:24px;display:grid;gap:16px;max-height:88vh;overflow:auto}.contentJsonEditor{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5;resize:vertical}.iconTextBtn{display:inline-flex;align-items:center;gap:6px;border:0;background:none;cursor:pointer;font:inherit}.iconTextBtn:disabled{opacity:.55;cursor:default}.checkboxLine{display:flex;align-items:center;gap:8px;font-size:13px}.contentAdminPage .catalogToolbar{gap:14px}.contentAdminPage .catalogToolbar .toolbarCount{white-space:nowrap}@media(max-width:700px){.contentModal{width:min(94vw,680px);padding:18px}.contentAdminPage .catalogHead{align-items:flex-start}.contentAdminPage .catalogToolbar{align-items:stretch;flex-direction:column}.contentAdminPage .tableWrap{overflow-x:auto}}`

export default async function Content() {
  const user = await requirePermission('content.view')
  const rows = await db.homepageBlock.findMany({ orderBy: { sortOrder: 'asc' } })
  return <><style dangerouslySetInnerHTML={{ __html: css }} /><ContentAdminShopify initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'content.manage')} /></>
}
