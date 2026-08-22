import {requirePermission} from '@/lib/auth'
import {db} from '@/lib/prisma'
import SettingsCenter from '@/components/settings-center'
export default async function Settings(){await requirePermission('settings.view');return <SettingsCenter initial={await db.setting.findMany({orderBy:{key:'asc'}})}/>} 
