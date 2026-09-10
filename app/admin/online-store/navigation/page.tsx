import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import NavigationEditorPro from '@/components/navigation-editor-pro'

export default async function Navigation(){
  await requirePermission('content.view')
  const [{navigation}, categories, collections] = await Promise.all([
    getThemeState(),
    db.category.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}}),
    db.collection.findMany({orderBy:{name:'asc'}}),
  ])
  return <NavigationEditorPro initial={JSON.parse(JSON.stringify(navigation))} categories={JSON.parse(JSON.stringify(categories))} collections={JSON.parse(JSON.stringify(collections))}/>
}
