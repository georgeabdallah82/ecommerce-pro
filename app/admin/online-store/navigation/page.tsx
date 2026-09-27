import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import NavigationEditorPro from '@/components/navigation-editor-pro'

export default async function Navigation(){
  await requirePermission('content.view')
  const [{navigation}, collections] = await Promise.all([
    getThemeState(),
    db.collection.findMany({orderBy:{name:'asc'}}),
  ])
  return <NavigationEditorPro initial={JSON.parse(JSON.stringify(navigation))} collections={JSON.parse(JSON.stringify(collections))}/>
}
