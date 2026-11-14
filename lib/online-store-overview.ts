// Admin › Online store › Overview (app/admin/online-store/page.tsx): what the store looks like, whether there are
// changes waiting to be published, what is still to set up, and the pages that manage the storefront.
// Everything here is worked out from the store's own data; nothing is a fixed "Ready".
import { FONT_OPTIONS } from '@/lib/font-options'
import { readinessChecks } from '@/lib/theme-review'

export type OverviewFacts = {
  // The theme, its page templates and the menu as the theme editor shows them (the saved draft, or what is live).
  theme: Record<string, any>
  templates: Record<string, any[]>
  navigation: any[]
  hasDraft: boolean
  draftSavedAt: string | null
  lastPublish: { at: string; by: string | null } | null
  // The store details the policies and the footer use: true when typed in (Settings, Policies).
  details: Record<'email' | 'phone' | 'address' | 'returnDays' | 'refundTime' | 'damageReportHours', boolean>
  maintenanceOn: boolean
}

export type SetupStatus = 'ok' | 'todo'
// Optional items are suggestions: they never count towards the progress, done or not.
export type SetupItem = { id: string; title: string; status: SetupStatus; optional?: boolean; detail: string; href: string; fix: string }

export const EDITOR = '/admin/online-store/theme-editor'
const settingsOf = (key: string) => `${EDITOR}?settings=${key}`

// The menu's links, nested ones included (menus are saved nested or flat).
export function menuLinkCount(navigation: any[]): number {
  const flat = (list: any[]): any[] => list.filter(Boolean).flatMap(item => [item, ...flat(Array.isArray(item?.children) ? item.children : [])])
  return flat(Array.isArray(navigation) ? navigation : []).length
}

// Homepage sections a visitor sees, not counting the header, announcement bar and footer.
export function visibleHomeSections(templates: Record<string, any[]>): number {
  return (templates['Home page'] || []).filter(s => s && s.enabled !== false && !['header', 'announcement', 'footer'].includes(s.type)).length
}

export function fontLabel(key: unknown): string {
  return FONT_OPTIONS.find(font => font.key === key)?.label || 'Default'
}

const SOCIAL = ['instagram', 'facebook', 'tiktok', 'twitter', 'youtube']
const POLICY_DETAILS: Array<[keyof OverviewFacts['details'], string]> = [['email', 'email'], ['phone', 'phone'], ['address', 'address'], ['returnDays', 'return days'], ['refundTime', 'refund time'], ['damageReportHours', 'damage report time']]

// The online store's part of the launch checklist, from the same checks the theme editor runs before a publish
// (lib/theme-review.ts) and the store details the policies use.
export function setupItems(f: OverviewFacts): SetupItem[] {
  const checks = readinessChecks({ theme: f.theme, templates: f.templates, navigation: f.navigation })
  const has = (prefix: string) => checks.filter(check => check.id === prefix || check.id.startsWith(prefix + '-'))
  const items: SetupItem[] = []

  const logo = Boolean(f.theme.logoUrl || f.theme.logoUrlDark)
  items.push({ id: 'logo', title: 'Logo', status: logo ? 'ok' : 'todo', detail: logo ? 'Shown in the header and the footer.' : 'Visitors see your brand name as plain text.', href: settingsOf('branding'), fix: logo ? 'Change' : 'Add a logo' })
  const favicon = Boolean(f.theme.faviconUrl)
  items.push({ id: 'favicon', title: 'Browser tab icon', status: favicon ? 'ok' : 'todo', detail: favicon ? 'Shown in browser tabs and bookmarks.' : 'Browser tabs show the default icon.', href: settingsOf('branding'), fix: favicon ? 'Change' : 'Add an icon' })

  const menuProblems = [...has('menu-empty'), ...has('menu-noname'), ...has('menu-nolink'), ...has('menu-link')]
  const links = menuLinkCount(f.navigation)
  items.push({ id: 'menu', title: 'Main menu', status: menuProblems.length ? 'todo' : 'ok', detail: menuProblems.length ? menuProblems[0].text + (menuProblems.length > 1 ? ` (and ${menuProblems.length - 1} more)` : '') : `${links} ${links === 1 ? 'link' : 'links'} in the header.`, href: '/admin/online-store/navigation', fix: 'Edit the menu' })

  const homeProblems = [...has('hero'), ...has('home-empty')]
  const sections = visibleHomeSections(f.templates)
  items.push({ id: 'homepage', title: 'Homepage', status: homeProblems.length ? 'todo' : 'ok', detail: homeProblems.length ? homeProblems[0].text : `${sections} ${sections === 1 ? 'section' : 'sections'} visitors see.`, href: EDITOR, fix: 'Edit the homepage' })

  const contrast = has('contrast')
  items.push({ id: 'colours', title: 'Readable colours', status: contrast.length ? 'todo' : 'ok', detail: contrast.length ? contrast[0].text : 'Text, buttons and the announcement bar are easy to read.', href: settingsOf('colors'), fix: 'Adjust colours' })

  const announcement = has('announcement')
  if (announcement.length) items.push({ id: 'announcement', title: 'Announcement bar', status: 'todo', detail: announcement[0].text, href: EDITOR, fix: 'Add the text' })

  const contact = f.details.email || f.details.phone
  items.push({ id: 'contact', title: 'Contact details', status: contact ? 'ok' : 'todo', detail: contact ? 'Shown in the footer, on the policies and in emails.' : 'No email or phone number for customers to reach you.', href: '/admin/settings', fix: 'Add them in Settings' })

  const missing = POLICY_DETAILS.filter(([key]) => !f.details[key]).map(([, label]) => label)
  items.push({ id: 'policies', title: 'Policies', status: missing.length ? 'todo' : 'ok', detail: missing.length ? `Placeholders show where these are missing: ${missing.join(', ')}.` : 'Your privacy, terms and refund pages use your store\'s details.', href: '/admin/online-store/policies', fix: 'Review the policies' })

  const social = SOCIAL.filter(key => String(f.theme.social?.[key] || '').trim()).length
  items.push({ id: 'social', title: 'Social links', status: social ? 'ok' : 'todo', optional: true, detail: social ? `${social} in the footer.` : 'Optional: link your Instagram, Facebook or TikTok in the footer.', href: settingsOf('social'), fix: social ? 'Edit' : 'Add links' })

  const arabic = f.theme.languages?.arabic === true
  items.push({ id: 'arabic', title: 'Arabic store', status: arabic ? 'ok' : 'todo', optional: true, detail: arabic ? 'Customers can switch the store to Arabic.' : 'Optional: the store is in English only.', href: settingsOf('languages'), fix: arabic ? 'Edit' : 'Turn on Arabic' })

  items.push({ id: 'open', title: 'Open to visitors', status: f.maintenanceOn ? 'todo' : 'ok', detail: f.maintenanceOn ? 'Maintenance mode is on: visitors see the maintenance page.' : 'Visitors can browse and order.', href: '/admin/settings', fix: f.maintenanceOn ? 'Turn maintenance off in Settings' : 'Settings' })
  return items
}

export function setupProgress(items: SetupItem[]) {
  const required = items.filter(item => !item.optional)
  return { done: required.filter(item => item.status === 'ok').length, total: required.length }
}

// "3 days ago", "just now": when the theme was published or the draft saved.
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  return 'just now'
}

export const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`
