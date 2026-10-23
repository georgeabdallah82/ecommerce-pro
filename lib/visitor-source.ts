// Where a visitor came from (the "Sources" list): the address they came from plus the tags that
// shopping links carry (utm_source, fbclid...). Pure, so it is easy to test.

export type SourceKey = 'direct' | 'google' | 'search' | 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'youtube' | 'x' | 'telegram' | 'email' | 'other'

export const SOURCE_LABELS: Record<SourceKey, string> = {
  direct: 'Direct',
  google: 'Google',
  search: 'Other search',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  telegram: 'Telegram',
  email: 'Email',
  other: 'Other websites',
}

const HOSTS: Array<[RegExp, SourceKey]> = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$/, 'facebook'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, 'telegram'],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/, 'email'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|yandex\.[a-z.]+|search\.brave\.com|baidu\.com)$/, 'search'],
]

const NAMED: Record<string, SourceKey> = {
  instagram: 'instagram', ig: 'instagram',
  facebook: 'facebook', fb: 'facebook', meta: 'facebook',
  whatsapp: 'whatsapp', wa: 'whatsapp',
  tiktok: 'tiktok',
  youtube: 'youtube',
  google: 'google', adwords: 'google',
  twitter: 'x', x: 'x',
  telegram: 'telegram',
  email: 'email', newsletter: 'email', mail: 'email', sms: 'direct',
}

function hostOf(url: string | null | undefined) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('android-app://')) return raw.slice('android-app://'.length).split('/')[0].toLowerCase()
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

export function visitorSource(input: { referrer?: string | null; landing?: string | null; ownHost?: string | null }): { key: SourceKey; host: string | null } {
  let query = new URLSearchParams()
  try { query = new URL(String(input.landing || '/'), 'https://store.invalid').searchParams } catch {}
  const tagged = String(query.get('utm_source') || '').trim().toLowerCase()
  const host = hostOf(input.referrer)
  const own = String(input.ownHost || '').toLowerCase().replace(/^www\./, '')

  // A tag on the link says it best (the owner writes it on purpose).
  if (tagged && NAMED[tagged]) return { key: NAMED[tagged], host: host && host !== own ? host : null }
  if (tagged && !NAMED[tagged] && tagged.length <= 40) return { key: 'other', host: tagged }
  // The ad networks add their own click tag to links.
  if (query.get('igshid')) return { key: 'instagram', host: host || null }
  if (query.get('ttclid')) return { key: 'tiktok', host: host || null }
  if (query.get('gclid')) return { key: 'google', host: host || null }
  if (query.get('fbclid')) return { key: /instagram\.com$/.test(host) ? 'instagram' : 'facebook', host: host || null }

  if (!host || host === own || (own && host.endsWith(`.${own}`))) return { key: 'direct', host: null }
  if (/^com\.google\.android\.gm$/.test(host)) return { key: 'email', host }
  if (host.startsWith('com.')) return { key: 'other', host }
  for (const [pattern, key] of HOSTS) if (pattern.test(host)) return { key, host }
  return { key: 'other', host }
}

export function sourceLabel(key: string, host?: string | null) {
  const label = SOURCE_LABELS[key as SourceKey] || 'Other websites'
  return key === 'other' && host ? host : label
}
