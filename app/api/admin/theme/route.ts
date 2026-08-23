import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { defaultNavigation, defaultSections, defaultTheme } from '@/lib/theme'

function normalizeSections(input: any[]) {
  return (Array.isArray(input) ? input : defaultSections).filter(Boolean).map((s: any) => {
    const type = s.type === 'image_banner' ? 'hero' : s.type
    const settings = { ...(s.settings || {}) }
    if (type === 'hero') settings.imageUrl = settings.imageUrl || settings.desktopImageUrl || settings.mobileImageUrl || ''
    return { ...s, type, enabled: s.enabled !== false, settings, blocks: Array.isArray(s.blocks) ? s.blocks : [] }
  })
}

function normalizeTemplates(input: any) {
  const source = input && typeof input === 'object' ? input : {}
  const out: Record<string, any[]> = {}
  for (const [key, value] of Object.entries(source)) out[key] = normalizeSections(value as any[])
  return out
}

export async function GET() {
  try {
    await requirePermission('content.view')
    const [themeSetting, sectionsSetting, navigationSetting] = await Promise.all([
      db.setting.findUnique({ where: { key: 'theme.config' } }),
      db.setting.findUnique({ where: { key: 'theme.sections' } }),
      db.setting.findUnique({ where: { key: 'navigation.main' } }),
    ])
    const rawTheme = themeSetting ? JSON.parse(themeSetting.value) : defaultTheme
    const normalized = normalizeSections(sectionsSetting ? JSON.parse(sectionsSetting.value) : defaultSections)
    const editorTemplates = normalizeTemplates(rawTheme.editorTemplates)
    editorTemplates['Home page'] = normalized
    const theme = { ...rawTheme, editorTemplates }
    return json({ theme, sections: normalized, navigation: navigationSetting ? JSON.parse(navigationSetting.value) : defaultNavigation }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const body = await req.json()
    const incomingTheme = body.theme || defaultTheme
    const sections = normalizeSections(body.sections || defaultSections)
    const navigation = Array.isArray(body.navigation) ? body.navigation : defaultNavigation
    const templates = normalizeTemplates(body.editorTemplates || incomingTheme.editorTemplates)
    templates['Home page'] = sections
    const theme = { ...incomingTheme, editorTemplates: templates }

    await db.$transaction([
      db.setting.upsert({ where: { key: 'theme.config' }, create: { key: 'theme.config', value: JSON.stringify(theme) }, update: { value: JSON.stringify(theme) } }),
      db.setting.upsert({ where: { key: 'theme.sections' }, create: { key: 'theme.sections', value: JSON.stringify(sections) }, update: { value: JSON.stringify(sections) } }),
      db.setting.upsert({ where: { key: 'navigation.main' }, create: { key: 'navigation.main', value: JSON.stringify(navigation) }, update: { value: JSON.stringify(navigation) } }),
    ])
    await audit(actor.id, 'theme.updated', 'Theme', 'theme.config', { templates: Object.keys(templates).length, sections: sections.length, navigation: navigation.length, preset: theme?.presets?.active || null })
    return json({ theme, sections, navigation }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to save theme' }, { status: 400 })
  }
}
