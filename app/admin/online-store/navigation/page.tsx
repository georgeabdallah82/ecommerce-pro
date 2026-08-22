import {requirePermission} from '@/lib/auth'
import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import NavigationEditor from '@/components/navigation-editor'
export default async function Navigation(){await requirePermission('content.view');const [{navigation},categories]=await Promise.all([getThemeState(),db.category.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}})]);return <NavigationEditor initial={JSON.parse(JSON.stringify(navigation))} categories={JSON.parse(JSON.stringify(categories))}/>} 
