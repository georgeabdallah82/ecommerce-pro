import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

// Restoring a past version loads it into the draft slots, the same place a
// manual edit lands -- it does not publish directly. The admin reviews it in
// the editor (and can keep editing) before choosing to publish, exactly like
// any other draft change.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('content.manage')
    const { id } = await params
    const version = await db.themeVersion.findUnique({ where: { id } })
    if (!version) return json({ error: 'Theme version not found' }, { status: 404 })

    await db.$transaction([
      db.setting.upsert({ where: { key: 'theme.draft' }, create: { key: 'theme.draft', value: version.theme }, update: { value: version.theme } }),
      db.setting.upsert({ where: { key: 'theme.draft.sections' }, create: { key: 'theme.draft.sections', value: version.sections }, update: { value: version.sections } }),
      db.setting.upsert({ where: { key: 'navigation.draft' }, create: { key: 'navigation.draft', value: version.navigation }, update: { value: version.navigation } }),
    ])

    await audit(actor.id, 'theme.version.restored', 'Theme', id, { restoredAt: new Date().toISOString() })
    return json({ ok: true, restored: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to restore theme version' }, { status: 400 }) }
}
