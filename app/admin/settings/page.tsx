import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import SettingsCenterPro from '@/components/settings-center-pro'

export default async function Settings() {
  await requirePermission('settings.view')
  return <SettingsCenterPro initial={await db.setting.findMany({ orderBy: { key: 'asc' } })} />
}
