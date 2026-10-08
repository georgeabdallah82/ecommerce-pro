// Turning a supplier's product page (AliExpress, Alibaba, Shein, or any shop) into a draft
// product. Pages reach us two ways: the store's server fetching a pasted link (works for shops
// that allow it), or the "Import to store" browser button reading the page the admin is looking
// at -- needed for AliExpress, Shein and Alibaba, which show servers a captcha instead.

export type ImportOption = { name: string; values: string[] }
export type ImportedProduct = {
  title: string
  description: string
  images: string[]
  price: number | null // supplier price, in currency units (12.5 = $12.50)
  currency: string | null
  options: ImportOption[]
  sourceUrl: string
}

export function importSource(url: string) {
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch {}
  const source = /(^|\.)aliexpress\./.test(host) ? 'aliexpress' : /(^|\.)alibaba\.com$/.test(host) ? 'alibaba' : /(^|\.)shein\./.test(host) ? 'shein' : 'other'
  const id = (url.match(/\/item\/(\d{6,})/) || url.match(/-p-(\d{4,})/) || url.match(/_(\d{8,})\.html/) || url.match(/(\d{9,})/) || [])[1] || ''
  return { source, id, host }
}

// A short, unique-looking SKU from where the product came from ("AE-1005002049812453").
export function importSku(url: string) {
  const { source, id } = importSource(url)
  const prefix = source === 'aliexpress' ? 'AE' : source === 'alibaba' ? 'AB' : source === 'shein' ? 'SH' : 'IMP'
  return `${prefix}-${id || Date.now().toString(36).toUpperCase()}`
}

// Supplier image links often point at a thumbnail; these patterns ask for the full-size photo.
export function fullSizeImage(raw: string, base?: string) {
  let url = String(raw || '').trim()
  if (!url || url.startsWith('data:')) return ''
  if (url.startsWith('//')) url = `https:${url}`
  try { url = new URL(url, base).toString() } catch { return '' }
  if (!/^https?:\/\//i.test(url)) return ''
  return url
    .replace(/(\.(?:jpe?g|png|webp|avif))_(?:\d+x\d+|Q\d+)[^/?#]*$/i, '$1') // AliExpress: x.jpg_640x640q75.jpg_.avif
    .replace(/_thumbnail_\d+x\d*(?=\.)/i, '')                                             // Shein: x_thumbnail_405x552.jpg
    .replace(/_\d{2,4}x\d{2,4}(?:q\d+)?(\.(?:jpe?g|png|webp|avif))(?=$|[?#])/i, '$1')   // Alibaba: x_220x220.jpg
}

const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
const metaTag = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  const tag = (html.match(re) || [''])[0]
  const content = (tag.match(/content=["']([^"']*)["']/i) || [])[1]
  return content ? decode(content).trim() : ''
}
const money = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

// True for the captcha / "verify you're human" pages these sites show servers.
export function isBlockedPage(html: string) {
  return html.length < 4000 && /punish|captcha|x5secdata/i.test(html)
    || /\/risk\/challenge|captcha_type=|_____tmd_____|verify you are human|unusual traffic|slide to verify/i.test(html.slice(0, 200000))
}

function jsonLdProduct(html: string): any {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim())
      const items = Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
      const product = items.find((x: any) => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product'))))
      if (product) return product
    } catch {}
  }
  return null
}

// Reads a product from a page's HTML: structured data first (JSON-LD), then the share-preview
// tags (Open Graph) every shop sets. Null when the page doesn't describe a product.
export function parseProductHtml(html: string, url: string): ImportedProduct | null {
  const ld = jsonLdProduct(html)
  const offers = ld ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : null
  const title = String(ld?.name || metaTag(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim()
  const ldImages = ld ? (Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : []).map((x: any) => typeof x === 'string' ? x : x?.url) : []
  const images = Array.from(new Set([...ldImages, metaTag(html, 'og:image')].map(x => fullSizeImage(String(x || ''), url)).filter(Boolean)))
  const price = money(offers?.price ?? offers?.lowPrice ?? metaTag(html, 'product:price:amount') ?? metaTag(html, 'og:price:amount'))
  const currency = String(offers?.priceCurrency || metaTag(html, 'product:price:currency') || metaTag(html, 'og:price:currency') || '').toUpperCase() || null
  const description = String(ld?.description || metaTag(html, 'og:description') || metaTag(html, 'description') || '').trim()
  if (!title || !images.length) return null
  return normalizeImport({ title: decode(title), description: decode(description), images, price, currency, options: [], sourceUrl: url })
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max)

// Cleans whatever arrived (from our parser or from the browser button) into safe, bounded data.
export function normalizeImport(raw: any): ImportedProduct {
  const sourceUrl = text(raw?.sourceUrl, 2000)
  const images = Array.from(new Set((Array.isArray(raw?.images) ? raw.images : []).map((x: unknown) => fullSizeImage(String(x || ''), sourceUrl)).filter(Boolean))).slice(0, 12) as string[]
  const options = (Array.isArray(raw?.options) ? raw.options : []).slice(0, 3).map((o: any) => ({
    name: text(o?.name, 40) || 'Option',
    values: Array.from(new Set((Array.isArray(o?.values) ? o.values : []).map((v: unknown) => text(v, 60)).filter(Boolean))).slice(0, 40) as string[],
  })).filter((o: ImportOption) => o.values.length > 1)
  const title = text(raw?.title, 200)
    .replace(/\s*[-|–]\s*(AliExpress|Alibaba\.com|SHEIN[^|]*)(\s.*)?$/i, '') // "Lamp - AliExpress 39" → "Lamp"
  return {
    title,
    description: text(raw?.description, 8000),
    images,
    price: money(raw?.price),
    currency: raw?.currency ? text(raw.currency, 8).toUpperCase().replace(/[^A-Z]/g, '') || null : null,
    options,
    sourceUrl,
  }
}

// Selling price from the supplier price: (price + per-item shipping/fees) × markup, rounded up to
// a price that ends in .99 (6.99 rather than 6.37). In cents.
export function markedUpPrice(costUnits: number, markup: number) {
  if (!(costUnits > 0) || !(markup > 0)) return 0
  const target = costUnits * markup
  const rounded = Math.ceil(target) - 0.01
  return Math.round(Math.max(rounded, costUnits + 0.01) * 100)
}

// Variants for the first option with several values (e.g. Color: Red, Blue, Green). Products
// with two or more option kinds get the first one as variants; the rest are listed in the
// description so nothing is lost.
export function importVariants(options: ImportOption[], baseSku: string, priceCents: number) {
  const first = options[0]
  if (!first) return []
  return first.values.slice(0, 30).map((value, i) => ({ name: value, sku: `${baseSku}-${i + 1}`, optionJson: JSON.stringify({ [first.name]: value }), price: priceCents, quantity: 0 }))
}

// Only public web addresses are fetched for an import (never the store's own network).
export function isPublicHttpUrl(raw: string) {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false
  if (host.includes(':')) return false // IPv6 literals
  return true
}
