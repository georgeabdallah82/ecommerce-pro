import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

export async function POST() {
  try {
    const actor = await requirePermission('content.manage')
    const [draft, draftSections, draftNavigation] = await Promise.all([
      db.setting.findUnique({ where: { key: 'theme.draft' } }),
      db.setting.findUnique({ where: { key: 'theme.draft.sections' } }),
      db.setting.findUnique({ where: { key: 'navigation.draft' } }),
    ])
    if (!draft) return json({ error: 'There are no unpublished theme changes.' }, { status: 409 })

    const writes = [
      db.setting.upsert({ where: { key: 'theme.config' }, create: { key: 'theme.config', value: draft.value }, update: { value: draft.value } }),
      ...(draftSections ? [db.setting.upsert({ where: { key: 'theme.sections' }, create: { key: 'theme.sections', value: draftSections.value }, update: { value: draftSections.value } })] : []),
      ...(draftNavigation ? [db.setting.upsert({ where: { key: 'navigation.main' }, create: { key: 'navigation.main', value: draftNavigation.value }, update: { value: draftNavigation.value } })] : []),
      db.setting.delete({ where: { key: 'theme.draft' } }),
      db.setting.delete({ where: { key: 'theme.draft.sections' } }),
      db.setting.delete({ where: { key: 'navigation.draft' } }),
    ]
    await db.$transaction(writes)

    for (const path of ['/', '/shop', '/collections', '/cart', '/blog', '/about']) revalidatePath(path)
    await audit(actor.id, 'theme.published', 'Theme', 'theme.config', { publishedAt: new Date().toISOString() })
    return json({ ok: true, published: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to publish theme' }, { status: 400 }) }
}
