import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { defaultNavigation, defaultSections, defaultTheme } from '@/lib/theme'
import { revalidatePath } from 'next/cache'

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
    const templateKey = typeof body.templateKey === 'string' && body.templateKey.trim() ? body.templateKey.trim() : 'Home page'
    const homeSections = normalizeSections(body.homeSections || body.sections || defaultSections)
    const activeSections = normalizeSections(body.sections || defaultSections)
    const templates = normalizeTemplates(body.editorTemplates || incomingTheme.editorTemplates)
    templates['Home page'] = homeSections
    templates[templateKey] = activeSections
    const theme = { ...incomingTheme, editorTemplates: templates }

    const navigationProvided = Array.isArray(body.navigation)
    const currentNavigationSetting = navigationProvided ? null : await db.setting.findUnique({ where: { key: 'navigation.main' } })
    const navigation = navigationProvided
      ? body.navigation
      : (currentNavigationSetting ? JSON.parse(currentNavigationSetting.value) : defaultNavigation)

    const writes: any[] = [
      db.setting.upsert({ where: { key: 'theme.config' }, create: { key: 'theme.config', value: JSON.stringify(theme) }, update: { value: JSON.stringify(theme) } }),
      db.setting.upsert({ where: { key: 'theme.sections' }, create: { key: 'theme.sections', value: JSON.stringify(homeSections) }, update: { value: JSON.stringify(homeSections) } }),
    ]
    if (navigationProvided) {
      writes.push(db.setting.upsert({ where: { key: 'navigation.main' }, create: { key: 'navigation.main', value: JSON.stringify(navigation) }, update: { value: JSON.stringify(navigation) } }))
    }

    await db.$transaction(writes)

    revalidatePath('/', 'layout')
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidatePath('/product/[slug]', 'page')
    revalidatePath('/collections', 'page')
    revalidatePath('/collections/[slug]', 'page')
    revalidatePath('/cart', 'page')
    revalidatePath('/about', 'page')
    revalidatePath('/blog', 'page')
    revalidatePath('/admin/online-store/theme-editor', 'page')
    revalidatePath('/admin/online-store/navigation', 'page')

    await audit(actor.id, 'theme.updated', 'Theme', 'theme.config', { templateKey, templates: Object.keys(templates).length, homeSections: homeSections.length, activeSections: activeSections.length, navigation: navigation.length, navigationUpdated: navigationProvided, preset: theme?.presets?.active || null })
    return json({ theme, sections: activeSections, homeSections, navigation }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to save theme' }, { status: 400 })
  }
}
