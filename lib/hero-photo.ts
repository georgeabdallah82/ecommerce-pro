// The store's own first hero photo, for pages that borrow the storefront's imagery (the sign-in panel), so they
// show the merchant's photos rather than a stock image. Server-safe: no client helpers.

const HERO_TYPES = new Set(['hero_slider', 'slideshow', 'hero'])

// Only site-relative paths and http(s) URLs are used. Anything else (javascript:, data:, protocol-relative) is ignored.
export function safePhotoUrl(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return null
  if (value.startsWith('/')) return value.startsWith('//') ? null : value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function firstHeroPhoto(sections: unknown): string | null {
  if (!Array.isArray(sections)) return null
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const s = section as { type?: unknown; enabled?: unknown; settings?: Record<string, unknown>; blocks?: unknown }
    if (!HERO_TYPES.has(String(s.type)) || s.enabled === false || s.settings?.enabled === false) continue
    const blocks = Array.isArray(s.blocks) ? s.blocks : []
    const candidates = [...blocks.map(b => (b as { settings?: Record<string, unknown> } | null)?.settings?.imageUrl), s.settings?.imageUrl]
    for (const raw of candidates) {
      const url = safePhotoUrl(raw)
      if (url) return url
    }
  }
  return null
}
