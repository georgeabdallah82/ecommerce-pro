import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

const MAX_THEME_VERSIONS = 20

export async function POST() {
  try {
    const actor = await requirePermission('content.manage')
    const [draft, draftSections, draftNavigation, publishedTheme, publishedSections, publishedNavigation] = await Promise.all([
      db.setting.findUnique({ where: { key: 'theme.draft' } }),
      db.setting.findUnique({ where: { key: 'theme.draft.sections' } }),
      db.setting.findUnique({ where: { key: 'navigation.draft' } }),
      db.setting.findUnique({ where: { key: 'theme.config' } }),
      db.setting.findUnique({ where: { key: 'theme.sections' } }),
      db.setting.findUnique({ where: { key: 'navigation.main' } }),
    ])
    if (!draft) return json({ error: 'There are no unpublished theme changes.' }, { status: 409 })

    // Snapshot the version about to be replaced so it can be browsed/restored
    // later, but only once something has actually been published before --
    // there's nothing worth keeping on the very first publish.
    if (publishedTheme) {
      await db.themeVersion.create({
        data: {
          theme: publishedTheme.value,
          sections: publishedSections?.value || '[]',
          navigation: publishedNavigation?.value || '[]',
          createdBy: actor.id,
        },
      })
      const staleVersions = await db.themeVersion.findMany({ orderBy: { createdAt: 'desc' } })
      const staleIds = staleVersions.slice(MAX_THEME_VERSIONS).map((v: { id: string }) => v.id)
      if (staleIds.length) await db.themeVersion.deleteMany({ where: { id: { in: staleIds } } })
    }

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
