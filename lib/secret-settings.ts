import { db } from '@/lib/prisma'
import { openSecret, sealSecret } from '@/lib/two-step'

// False when a sealed value can no longer be opened, e.g. after AUTH_SECRET was changed.
export async function isReadableSecret(stored: string | null | undefined) {
  const value = String(stored || '')
  if (!value || !value.startsWith('v1.')) return true
  return (await openSecret(value)) !== null
}

// Settings that hold secrets are kept sealed (see app/api/admin/settings/route.ts). Any value saved
// before sealing existed is sealed here, once; the daily job runs this.
const SEALED_KEYS = ['tracking.metaCapiToken']

export async function sealPlainSecrets() {
  const rows = await db.setting.findMany({ where: { key: { in: SEALED_KEYS } }, select: { key: true, value: true } })
  let sealed = 0
  for (const row of rows) {
    if (!row.value || row.value.startsWith('v1.')) continue
    await db.setting.update({ where: { key: row.key }, data: { value: await sealSecret(row.value) } })
    sealed++
  }
  return sealed
}
