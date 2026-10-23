import { db } from '@/lib/prisma'
import { TEAM_NOTICES_SETTING, normalizeNotices, type Notice } from '@/lib/team-notices'

export async function getNotices(): Promise<Notice[]> {
  const row = await db.setting.findUnique({ where: { key: TEAM_NOTICES_SETTING } })
  return normalizeNotices(row?.value)
}

export async function saveNotices(list: Notice[]) {
  const value = JSON.stringify(list)
  await db.setting.upsert({ where: { key: TEAM_NOTICES_SETTING }, update: { value }, create: { key: TEAM_NOTICES_SETTING, value } })
}
