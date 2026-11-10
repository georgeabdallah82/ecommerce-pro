import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'
import type { ReviewSnapshot } from '@/lib/theme-review'

// What is live now (theme.config, theme.sections, navigation.main) and what would go live
// on publish (the draft settings). The editor compares the two, so the review always matches
// exactly what POST /api/admin/theme/publish will write.

function parse(value: string | null | undefined, fallback: any) {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function snapshot(themeValue: string | null | undefined, homeValue: string | null | undefined, navValue: string | null | undefined): ReviewSnapshot {
  const theme = parse(themeValue, {})
  const templates: Record<string, any[]> = { ...(theme.editorTemplates && typeof theme.editorTemplates === 'object' ? theme.editorTemplates : {}) }
  templates['Home page'] = parse(homeValue, [])
  return { theme, templates, navigation: parse(navValue, []) }
}

export async function GET() {
  try {
    await requirePermission('content.view')
    const keys = ['theme.config', 'theme.sections', 'navigation.main', 'theme.draft', 'theme.draft.sections', 'navigation.draft']
    const rows = await db.setting.findMany({ where: { key: { in: keys } } })
    const value = (key: string) => rows.find((row: { key: string; value: string }) => row.key === key)?.value
    const hasPublished = value('theme.config') !== undefined
    const hasDraft = value('theme.draft') !== undefined
    const publishedNav = value('navigation.main')
    const published = snapshot(value('theme.config'), value('theme.sections'), publishedNav)
    // A draft that does not save a menu publishes the live menu unchanged (see the publish route).
    const draft = snapshot(value('theme.draft'), value('theme.draft.sections'), value('navigation.draft') ?? publishedNav)
    return json({ hasDraft, firstPublish: hasDraft && !hasPublished, published, draft }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return routeError(e, 'Forbidden', 403) }
}
