import { cache } from 'react'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getStorefrontSettings } from '@/lib/storefront-settings'

// Shared helpers for page titles, descriptions and social share previews (WhatsApp,
// Instagram, Facebook, Google).

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

// Plain text for a meta description: tags stripped, whitespace collapsed, cut at a word
// boundary near `max`. Placeholder-looking values ("0", "-", "") count as missing.
export function metaText(value: unknown, max = 160): string | undefined {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length < 4 || /^[\d\s.,-]+$/.test(text)) return undefined
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : cut.length)}…`
}

// WhatsApp, Facebook and Instagram don't render SVG previews; only raster images qualify.
export function isShareableImage(url: unknown): url is string {
  if (typeof url !== 'string' || !/^(https?:\/\/|\/)/i.test(url.trim())) return false
  return !/\.svg(\?|#|$)/i.test(url) && !/image\/svg/i.test(url)
}

export function absoluteUrl(url: string) {
  return /^(https?:\/\/|data:)/i.test(url) ? url : `${siteUrl()}${url.startsWith('/') ? '' : '/'}${url}`
}

function firstImageInSections(sections: unknown): string | undefined {
  const found: string[] = []
  const walk = (value: unknown) => {
    if (found.length) return
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === 'string' && /image/i.test(key) && isShareableImage(item)) { found.push(item); return }
      walk(item)
    }
  }
  walk(sections)
  return found[0]
}

export type SiteSeo = { brand: string; title: string; description: string; image?: string }

// Store-wide defaults: Settings > General > Search engine listing first, then the theme's
// brand name, the homepage's first banner image, and the first product photo.
// Used until the merchant writes their own (Settings > SEO): built from what the store really
// offers, so search results don't promise returns or delivery terms the store doesn't have.
function defaultDescription(brand: string, map: Map<string, string>) {
  const country = (map.get('store.country') || '').trim()
  const currency = map.get('store.currency') || 'USD'
  const threshold = Number(map.get('checkout.freeShippingThreshold'))
  const perks = [
    map.get('payment.cod') !== 'false' ? 'cash on delivery' : '',
    Number.isFinite(threshold) && threshold > 0 ? `free delivery on orders over ${currency === 'USD' ? `$${threshold}` : `${threshold} ${currency}`}` : '',
    map.get('returns.enabled') === 'false' ? '' : 'easy returns',
  ].filter(Boolean)
  const lead = `Shop ${brand} online${country ? ` with delivery across ${country}` : ''}.`
  return perks.length ? `${lead} ${perks.join(', ').replace(/^./, c => c.toUpperCase())}.` : lead
}

export const getSiteSeo = cache(loadSiteSeo)
async function loadSiteSeo(): Promise<SiteSeo> {
  const [map, themeState] = await Promise.all([
    getStorefrontSettings().catch(() => new Map<string, string>()),
    getThemeState().catch(() => null),
  ])
  const brand = String(themeState?.theme?.brandName || map.get('store.name') || process.env.NEXT_PUBLIC_BRAND_NAME || 'Our store').replace(/\s+/g, ' ').trim()
  const title = map.get('seo.title') || brand
  const description = metaText(map.get('seo.description')) || defaultDescription(brand, map)
  let image = isShareableImage(map.get('seo.image')) ? map.get('seo.image') : firstImageInSections(themeState?.sections)
  if (!image) {
    const products = await db.product.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 12, select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } } }).catch(() => [])
    image = products.map(p => p.images[0]?.url).find(isShareableImage)
  }
  return { brand, title, description, image: image ? absoluteUrl(image) : undefined }
}

// openGraph + twitter for one page. Next.js replaces (not merges) a parent's openGraph, so
// every page that sets its own passes the share image again (falling back to the site's).
export function shareMeta({ title, description, url, image }: { title: string; description?: string; url: string; image?: string }) {
  const images = image ? [{ url: image, alt: title }] : undefined
  return {
    openGraph: { type: 'website' as const, title, description, url, images },
    twitter: { card: image ? 'summary_large_image' as const : 'summary' as const, title, description, images: image ? [image] : undefined },
  }
}
