import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { defaultNavigation, defaultSections, defaultTheme, getThemeEditorState } from '@/lib/theme'

function normalizeSections(input: any[]): any[] { return (Array.isArray(input) ? input : defaultSections).filter(Boolean).map((s: any) => ({ ...s, type: s.type === 'image_banner' ? 'hero' : s.type, enabled: s.enabled !== false, settings: { ...(s.settings || {}) }, blocks: Array.isArray(s.blocks) ? s.blocks : [] })) }
function normalizeTemplates(input: any): Record<string, any[]> { const source = input && typeof input === 'object' ? input : {}; const out: Record<string, any[]> = {}; for (const [key, value] of Object.entries(source)) out[key] = normalizeSections(value as any[]); return out }
function parseSetting(value: string | null | undefined, fallback: any) { if (!value) return fallback; try { return JSON.parse(value) } catch { return fallback } }

export async function GET() {
  try {
    await requirePermission('content.view')
    const state = await getThemeEditorState()
    return json(state, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage'); const body = await req.json()
    const incomingTheme = body.theme && typeof body.theme === 'object' ? body.theme : defaultTheme
    const incomingTemplates = normalizeTemplates(body.editorTemplates || incomingTheme.editorTemplates)
    const templateKey = typeof body.templateKey === 'string' && body.templateKey.trim() ? body.templateKey.trim() : (incomingTheme.editorTemplateKey || 'Home page')
    const activeSections = normalizeSections(Object.prototype.hasOwnProperty.call(incomingTemplates, templateKey) ? incomingTemplates[templateKey] : body.sections)
    const templates = normalizeTemplates({ ...incomingTemplates, [templateKey]: activeSections })
    if (!Object.prototype.hasOwnProperty.call(templates, 'Home page')) templates['Home page'] = normalizeSections(body.homeSections || defaultSections)
    const theme = { ...incomingTheme, editorTemplateKey: templateKey, editorTemplates: templates }
    const homeSections = templates['Home page']
    const navigationProvided = Array.isArray(body.navigation)
    const currentNavigation = navigationProvided ? body.navigation : parseSetting((await db.setting.findUnique({ where: { key: 'navigation.draft' } }))?.value, defaultNavigation)
    await db.$transaction([
      db.setting.upsert({ where: { key: 'theme.draft' }, create: { key: 'theme.draft', value: JSON.stringify(theme) }, update: { value: JSON.stringify(theme) } }),
      db.setting.upsert({ where: { key: 'theme.draft.sections' }, create: { key: 'theme.draft.sections', value: JSON.stringify(homeSections) }, update: { value: JSON.stringify(homeSections) } }),
      ...(navigationProvided ? [db.setting.upsert({ where: { key: 'navigation.draft' }, create: { key: 'navigation.draft', value: JSON.stringify(currentNavigation) }, update: { value: JSON.stringify(currentNavigation) } })] : []),
    ])
    await audit(actor.id, 'theme.draft.updated', 'Theme', 'theme.draft', { templateKey, templates: Object.keys(templates).length, activeSections: activeSections.length, navigationUpdated: navigationProvided })
    return json({ theme, sections: activeSections, homeSections, editorTemplates: templates, navigation: currentNavigation, draft: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to save theme draft' }, { status: 400 }) }
}
