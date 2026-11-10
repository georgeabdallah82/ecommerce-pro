// Pure checks for the theme editor: what a publish would change, and what is worth fixing
// before it goes live. No database or React here, so the server (the review endpoint) and the
// editor run exactly the same logic, and tests/theme-review.test.ts can cover it.

export type ReviewSection = { id: string; type: string; enabled?: boolean; settings?: Record<string, any>; blocks?: any[] }
export type ReviewSnapshot = { theme: Record<string, any>; templates: Record<string, ReviewSection[]>; navigation: any[] }
export type ReviewGroup = { id: string; title: string; items: string[] }
export type ReadinessCheck = { id: string; level: 'warn' | 'info'; where: 'theme' | 'sections' | 'menu'; text: string }

// Keys that the editor keeps for its own bookkeeping; a change to them is never a visitor-facing change.
const INTERNAL_THEME_KEYS = new Set(['editorTemplates', 'editorTemplateKey', 'editorTemplateMigrations', 'storefrontVersion', 'legacyHomeBlocksMigrated', 'siteHeader'])

const THEME_LABELS: Record<string, string> = {
  brandName: 'Brand name', logoUrl: 'Logo', logoUrlDark: 'Dark-mode logo', faviconUrl: 'Favicon',
  colors: 'Colours', typography: 'Typography', layout: 'Layout', buttons: 'Buttons', cards: 'Cards',
  productCard: 'Product cards', productCardMarket: 'Product card text', productPage: 'Product page',
  collectionPage: 'Collection page', discovery: 'Search and browsing', cart: 'Cart', header: 'Header',
  announcement: 'Announcement bar', footer: 'Footer', social: 'Social links', delivery: 'Delivery bar',
  whatsapp: 'WhatsApp button', animations: 'Animation', accessibility: 'Accessibility',
  languages: 'Languages', customCss: 'Custom CSS', presets: 'Preset',
}

export function humanize(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// A stable JSON form (sorted keys) so two equal objects always compare equal.
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value === undefined ? null : value)
}
const isPlain = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value)

function diffTheme(published: Record<string, any>, draft: Record<string, any>): ReviewGroup[] {
  const groups: ReviewGroup[] = []
  const keys = [...new Set([...Object.keys(published), ...Object.keys(draft)])].filter(k => !INTERNAL_THEME_KEYS.has(k))
  for (const key of keys) {
    const before = published[key]
    const after = draft[key]
    if (stable(before) === stable(after)) continue
    const title = THEME_LABELS[key] || humanize(key)
    if (isPlain(before) && isPlain(after)) {
      const subs = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(sub => stable(before[sub]) !== stable(after[sub]))
      groups.push({ id: `theme.${key}`, title, items: subs.map(sub => `${humanize(sub)} changed`) })
    } else {
      groups.push({ id: `theme.${key}`, title, items: ['Changed'] })
    }
  }
  return groups
}

function diffTemplate(before: ReviewSection[], after: ReviewSection[], labelFor: (type: string) => string): string[] {
  const items: string[] = []
  const beforeById = new Map(before.map(s => [s.id, s]))
  const afterById = new Map(after.map(s => [s.id, s]))
  for (const section of after) if (!beforeById.has(section.id)) items.push(`Added ${labelFor(section.type)}`)
  for (const section of before) if (!afterById.has(section.id)) items.push(`Removed ${labelFor(section.type)}`)
  for (const section of after) {
    const old = beforeById.get(section.id)
    if (!old) continue
    const name = labelFor(section.type)
    if ((old.enabled !== false) !== (section.enabled !== false)) items.push(`${section.enabled !== false ? 'Shown' : 'Hidden'}: ${name}`)
    if (stable(old.settings || {}) !== stable(section.settings || {}) || stable(old.blocks || []) !== stable(section.blocks || [])) items.push(`Edited ${name}`)
  }
  // Same sections, different order.
  const sharedBefore = before.filter(s => afterById.has(s.id)).map(s => s.id)
  const sharedAfter = after.filter(s => beforeById.has(s.id)).map(s => s.id)
  if (sharedBefore.join('|') !== sharedAfter.join('|')) items.push('Reordered sections')
  return items
}

function diffNavigation(before: any[], after: any[]): ReviewGroup[] {
  if (stable(before) === stable(after)) return []
  const count = (list: any[]): number => (Array.isArray(list) ? list.reduce((n, item) => n + 1 + count(item?.children || []), 0) : 0)
  return [{ id: 'navigation', title: 'Menu', items: [`Menu changed (${count(after)} ${count(after) === 1 ? 'item' : 'items'}, was ${count(before)})`] }]
}

// Everything that would change for visitors if the draft were published now.
export function reviewThemeChanges(published: ReviewSnapshot, draft: ReviewSnapshot, labelFor: (type: string) => string = humanize, pageLabel: (key: string) => string = key => key): ReviewGroup[] {
  const groups: ReviewGroup[] = [...diffTheme(published.theme, draft.theme)]
  const pageKeys = [...new Set([...Object.keys(published.templates), ...Object.keys(draft.templates)])]
  for (const key of pageKeys) {
    const items = diffTemplate(published.templates[key] || [], draft.templates[key] || [], labelFor)
    if (items.length) groups.push({ id: `page.${key}`, title: pageLabel(key), items })
  }
  groups.push(...diffNavigation(published.navigation, draft.navigation))
  return groups
}

// --- Readiness -------------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | null {
  const raw = String(hex || '').trim().replace(/^#/, '')
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// WCAG contrast ratio (1 to 21), or null if either colour is not a hex value.
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return null
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const CONTRAST_PAIRS: { key: string; text: string; background: string; name: string }[] = [
  { key: 'text', text: 'text', background: 'background', name: 'Text on the page background' },
  { key: 'muted', text: 'muted', background: 'background', name: 'Secondary text on the page background' },
  { key: 'buttonText', text: 'buttonText', background: 'primary', name: 'Button text on the button colour' },
  { key: 'announcementText', text: 'announcementText', background: 'announcementBg', name: 'Announcement text on its background' },
]
export const MIN_CONTRAST = 4.5

function menuItemsWithoutChildren(navigation: any[]) {
  // Menus are saved either nested (children) or flat (parentId); both are read here.
  const parents = new Set<string>()
  const flat = (list: any[]): any[] => list.flatMap(item => [item, ...flat(item?.children || [])])
  const all = flat(navigation.filter(Boolean))
  for (const item of all) if (item.parentId) parents.add(item.parentId)
  return all.filter(item => !(item.children?.length) && !parents.has(item.id))
}

export function readinessChecks(snapshot: { theme: Record<string, any>; templates: Record<string, ReviewSection[]>; navigation: any[] }): ReadinessCheck[] {
  const { theme } = snapshot
  const checks: ReadinessCheck[] = []
  const home = snapshot.templates['Home page'] || []

  if (!theme.logoUrl && !theme.logoUrlDark) checks.push({ id: 'logo', level: 'warn', where: 'theme', text: 'No logo uploaded. Visitors see your brand name as plain text.' })
  if (!theme.faviconUrl) checks.push({ id: 'favicon', level: 'info', where: 'theme', text: 'No favicon, so browser tabs show the default icon.' })
  if (theme.announcement?.enabled !== false && theme.announcement && !String(theme.announcement.text || '').trim()) checks.push({ id: 'announcement', level: 'warn', where: 'theme', text: 'The announcement bar is on but has no text.' })

  for (const pair of CONTRAST_PAIRS) {
    const text = theme.colors?.[pair.text]
    const background = theme.colors?.[pair.background]
    const ratio = contrastRatio(text, background)
    if (ratio !== null && ratio < MIN_CONTRAST) checks.push({ id: `contrast-${pair.key}`, level: 'warn', where: 'theme', text: `${pair.name} is ${(Math.floor(ratio * 10) / 10).toFixed(1)}:1. Aim for ${MIN_CONTRAST}:1 or more so it is easy to read.` })
  }

  const menu = Array.isArray(snapshot.navigation) ? snapshot.navigation : []
  if (!menu.length) checks.push({ id: 'menu-empty', level: 'warn', where: 'menu', text: 'Your menu is empty, so visitors have no links in the header.' })
  for (const item of menuItemsWithoutChildren(menu)) {
    const label = String(item.label || '').trim()
    if (!label) checks.push({ id: `menu-noname-${item.id}`, level: 'warn', where: 'menu', text: 'A menu item has no name, so visitors see “Untitled”.' })
    else if (!String(item.url || '').trim() || String(item.url).trim() === '#') checks.push({ id: `menu-nolink-${item.id}`, level: 'warn', where: 'menu', text: `“${label}” has no link address.` })
  }

  const visible = home.filter(s => s.enabled !== false)
  for (const section of visible) {
    if (section.type === 'hero_slider' && !(section.blocks || []).some(b => b?.settings?.imageUrl)) checks.push({ id: `hero-${section.id}`, level: 'warn', where: 'sections', text: 'The slideshow on your homepage has no images, so it will look empty.' })
    if (section.type === 'hero' && !section.settings?.imageUrl) checks.push({ id: `hero-${section.id}`, level: 'warn', where: 'sections', text: 'An image banner on your homepage has no image.' })
  }
  const contentVisible = visible.filter(s => !['header', 'announcement', 'footer'].includes(s.type))
  if (!contentVisible.length) checks.push({ id: 'home-empty', level: 'info', where: 'sections', text: 'Your homepage has no visible content sections.' })

  return checks
}
