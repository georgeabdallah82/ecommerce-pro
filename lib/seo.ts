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

// "$39.00" for a price in cents, in the store's currency; falls back to "39.00 LBP" for a currency the
// browser's formatter does not know.
export function sharePrice(cents: number, currency: string): string {
  const amount = Math.max(0, cents) / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

// The price a product is "from" in cents: the lowest option price, or the base price when no option has its own.
export function fromPrice(basePrice: number, variants?: Array<{ price?: number | null }> | null): number {
  const prices = (variants || []).map(v => (typeof v.price === 'number' ? v.price : basePrice))
  return prices.length ? Math.min(...prices) : basePrice
}

// What a shared product link says in WhatsApp, Instagram and Facebook: the price and whether it is in stock
// come first (they are the first thing a friend wants to know, and the preview cuts the rest), then the
// product's own description. A sale shows the old price too.
export function productShareText(p: { name: string; description?: string; cents: number; compareAtCents?: number | null; currency: string; soldOut: boolean; preorder?: boolean }) {
  const price = sharePrice(p.cents, p.currency)
  const was = p.compareAtCents && p.compareAtCents > p.cents ? ` (was ${sharePrice(p.compareAtCents, p.currency)})` : ''
  // A pre-order is sold out but still for sale, so it says so rather than "Out of stock".
  const stock = p.preorder ? 'Pre-order' : p.soldOut ? 'Out of stock' : 'In stock'
  const title = p.name.includes(price) ? p.name : `${p.name} \u00b7 ${price}`
  const facts = `${price}${was} \u00b7 ${stock}`
  const description = metaText(p.description ? `${facts}. ${p.description}` : `${facts}. Buy ${p.name} online with fast delivery.`, 200)
  return { title, description: description || facts, price, stock }
}

// openGraph + twitter for one page. Next.js replaces (not merges) a parent's openGraph, so
// every page that sets its own passes the share image again (falling back to the site's).
export function shareMeta({ title, description, url, image, type = 'website' }: { title: string; description?: string; url: string; image?: string; type?: 'website' | null }) {
  const images = image ? [{ url: image, alt: title }] : undefined
  return {
    // type: null leaves og:type out so the page can write its own (a product page says "product").
    openGraph: { ...(type ? { type } : {}), title, description, url, images },
    twitter: { card: image ? 'summary_large_image' as const : 'summary' as const, title, description, images: image ? [image] : undefined },
  }
}
