// The team notice board (Admin > Team notices, shown at the top of every admin page): short messages
// from the owner or a manager to the staff. Staff only: customers never see them. Stored as one
// setting (lib/team-notices-server.ts), so there is no database table; the rules here need no database.

export const TEAM_NOTICES_SETTING = 'team.notices'
export const MAX_NOTICE_TEXT = 300
// Notices showing at the same time, and notices remembered in total (the oldest are forgotten).
export const MAX_ACTIVE = 5
export const MAX_STORED = 30

export type Notice = {
  id: string
  text: string
  createdAt: string
  // null = stays until it is removed.
  expiresAt: string | null
  authorName: string
  alerted: boolean
}

export const KEEP_CHOICES = [
  { key: '1d', label: '1 day', days: 1 },
  { key: '3d', label: '3 days', days: 3 },
  { key: '7d', label: '7 days', days: 7 },
  { key: 'until', label: 'Until I remove it', days: 0 },
] as const
export type KeepChoice = typeof KEEP_CHOICES[number]['key']
export const DEFAULT_KEEP: KeepChoice = '3d'

// One tidy paragraph: extra spaces and line breaks become single spaces, and it is cut to the limit.
export function cleanNoticeText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTICE_TEXT) : ''
}

export function keepChoice(value: unknown): KeepChoice {
  return KEEP_CHOICES.some(c => c.key === value) ? (value as KeepChoice) : DEFAULT_KEEP
}

export function expiryFor(choice: KeepChoice, now: Date): string | null {
  const days = KEEP_CHOICES.find(c => c.key === choice)?.days || 0
  return days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString() : null
}

const isoOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

// What is stored, read leniently: anything unusable is dropped, newest first.
export function normalizeNotices(raw: unknown): Notice[] {
  let list: unknown = raw
  if (typeof raw === 'string') { try { list = JSON.parse(raw) } catch { return [] } }
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: Notice[] = []
  for (const item of list) {
    const n = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const text = cleanNoticeText(n.text)
    const createdAt = isoOrNull(n.createdAt)
    const id = typeof n.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(n.id) ? n.id : ''
    if (!text || !createdAt || !id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, text, createdAt, expiresAt: isoOrNull(n.expiresAt), authorName: typeof n.authorName === 'string' ? n.authorName.trim().slice(0, 80) || 'Staff' : 'Staff', alerted: n.alerted === true })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_STORED)
}

export const isActive = (notice: Notice, now: Date) => !notice.expiresAt || new Date(notice.expiresAt).getTime() > now.getTime()

export function activeNotices(list: Notice[], now: Date): Notice[] {
  return list.filter(n => isActive(n, now)).slice(0, MAX_ACTIVE)
}

// Adding one: refused when five are already showing (remove one first), otherwise newest first.
export function addNotice(list: Notice[], notice: Notice, now: Date): { ok: true; list: Notice[] } | { ok: false; error: string } {
  if (list.filter(n => isActive(n, now)).length >= MAX_ACTIVE) return { ok: false, error: `There are already ${MAX_ACTIVE} notices showing. Remove one first.` }
  return { ok: true, list: [notice, ...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_STORED) }
}

export const removeNotice = (list: Notice[], id: string) => list.filter(n => n.id !== id)

// "just now", "5 min ago", "3 h ago", "2 days ago".
export function noticeAge(createdAt: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

// The phone alert: a short title and the start of the message.
export function noticeAlert(notice: Pick<Notice, 'text' | 'authorName'>) {
  const body = notice.text.length > 140 ? `${notice.text.slice(0, 137).trimEnd()}...` : notice.text
  return { title: `Team notice from ${notice.authorName}`, body, url: '/admin' }
}
