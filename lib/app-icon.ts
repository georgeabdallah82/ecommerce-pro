import type { MetadataRoute } from 'next'

// The store as a phone app: what a customer gets with "Add to Home Screen" / "Install app"
// (app/manifest.ts). The icon is made in Settings > General (components/app-icon-card.tsx): the
// browser draws the logo on a square and saves a 512px and a 192px PNG; until then the favicon or
// logo is used as it is.

export const APP_ICON_LARGE = 'app.icon512'
export const APP_ICON_SMALL = 'app.icon192'
export const APP_ICON_SIZES = { large: 512, small: 192 } as const
// Space around the logo, as a share of the icon's width: phones crop icons to circles or rounded
// squares (the "maskable" safe zone is the middle 80%).
export const APP_ICON_PADDING = 0.14

// The name under the icon has room for about 12 letters.
export function appShortName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean.length <= 12) return clean
  const firstWord = clean.split(' ')[0]
  return firstWord.length <= 12 ? firstWord : clean.slice(0, 12)
}

const isUsableUrl = (value: unknown) => {
  const v = String(value ?? '').trim()
  return /^https:\/\//i.test(v) || (v.startsWith('/') && !v.startsWith('//'))
}

// The picture the icon is made from when the owner hasn't chosen one: the favicon, else the logo.
export function appIconSource(theme: { faviconUrl?: string | null; logoUrl?: string | null }): string {
  return [theme.faviconUrl, theme.logoUrl].map(v => String(v ?? '').trim()).find(isUsableUrl) || ''
}

const typeOf = (url: string) => /\.svg(\?|$)/i.test(url) ? 'image/svg+xml' : /\.png(\?|$)/i.test(url) ? 'image/png' : /\.jpe?g(\?|$)/i.test(url) ? 'image/jpeg' : /\.webp(\?|$)/i.test(url) ? 'image/webp' : undefined

export function manifestIcons(saved: { large?: string | null; small?: string | null }, fallback: string): NonNullable<MetadataRoute.Manifest['icons']> {
  const large = isUsableUrl(saved.large) ? String(saved.large) : ''
  const small = isUsableUrl(saved.small) ? String(saved.small) : ''
  if (large) {
    return [
      ...(small ? [{ src: small, sizes: '192x192', type: 'image/png', purpose: 'any' as const }] : []),
      { src: large, sizes: '512x512', type: 'image/png', purpose: 'any' as const },
      { src: large, sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ]
  }
  if (!fallback) return []
  const type = typeOf(fallback)
  return [{ src: fallback, sizes: 'any', ...(type ? { type } : {}), purpose: 'any' as const }]
}

// The icon an iPhone uses for the home screen (it ignores the manifest's icons).
export function appleTouchIcon(saved: { large?: string | null; small?: string | null }, fallback: string): string {
  return [saved.small, saved.large].map(v => String(v ?? '').trim()).find(isUsableUrl) || (fallback && !/\.svg(\?|$)/i.test(fallback) ? fallback : '')
}
