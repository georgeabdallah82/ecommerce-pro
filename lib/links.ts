// Link helpers shared by the storefront header, footer and contact buttons.

// Menu items are typed in by hand, so "about-us" (no leading slash) is common. A browser
// resolves that against the current page (/collections/goods -> /collections/about-us),
// which 404s everywhere but the homepage. Bare domains get https:// for the same reason.
export function normalizeNavUrl(url: unknown): string {
  const value = String(url ?? '').trim()
  if (!value) return ''
  if (/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(value)) return value
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`
  return `/${value}`
}

const DIAL_CODES: Record<string, string> = {
  lebanon: '961', 'united arab emirates': '971', uae: '971', 'saudi arabia': '966', jordan: '962',
  syria: '963', iraq: '964', egypt: '20', qatar: '974', kuwait: '965', bahrain: '973', oman: '968',
  cyprus: '357', turkey: '90', france: '33', germany: '49', 'united kingdom': '44', uk: '44',
  'united states': '1', usa: '1', canada: '1', australia: '61',
}

// wa.me needs the full international number. Merchants usually type the local one
// ("79 137 663", "03 123 456"), which opens a chat with nobody, so the store country's
// dialling code is added when the number doesn't already carry one.
export function whatsappDigits(phone: unknown, country?: unknown): string {
  const raw = String(phone ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (raw.startsWith('+')) return digits
  if (raw.startsWith('00')) return digits.slice(2)
  const code = DIAL_CODES[String(country ?? '').trim().toLowerCase()]
  if (!code) return digits
  if (digits.startsWith(code) && digits.length > code.length + 6) return digits
  return code + digits.replace(/^0+/, '')
}

export function whatsappUrl(phone: unknown, country?: unknown): string {
  const digits = whatsappDigits(phone, country)
  return digits ? `https://wa.me/${digits}` : ''
}

// Where to go after signing in. Only same-site paths: "//evil.com" or "https://..." would
// turn the login form into an open redirect.
export function safeNextPath(value: unknown, fallback = '/account'): string {
  const path = String(value ?? '').trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\') || /[\r\n]/.test(path)) return fallback
  return path
}
