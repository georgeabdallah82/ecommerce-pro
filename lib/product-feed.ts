// Product catalog feed for Meta (Facebook/Instagram) and TikTok catalog ads, in the RSS/Google
// Merchant format both accept. Each item's id is the product id -- the same id the pixels send
// as content_id -- so an ad can show a visitor the exact products they viewed or added to cart.
export type FeedProduct = {
  id: string
  name: string
  slug: string
  description?: string | null
  shortDescription?: string | null
  brand?: string | null
  vendor?: string | null
  basePrice: number
  compareAtPrice?: number | null
  soldOut: boolean
  images: Array<{ url: string }>
}

const xml = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const price = (cents: number, currency: string) => `${(Math.max(0, cents) / 100).toFixed(2)} ${currency}`

export function plainText(html: string | null | undefined) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

export function productFeedXml(products: FeedProduct[], store: { name: string; url: string; currency: string }) {
  const absolute = (url: string) => /^https?:\/\//i.test(url) ? url : `${store.url}${url.startsWith('/') ? '' : '/'}${url}`
  const items = products
    .filter(p => p.images.some(i => i.url && !/\.svg(\?|$)/i.test(i.url)))
    .map(p => {
      const images = p.images.map(i => i.url).filter(url => url && !/\.svg(\?|$)/i.test(url)).map(absolute)
      const onSale = !!p.compareAtPrice && p.compareAtPrice > p.basePrice
      const description = (plainText(p.description) || plainText(p.shortDescription) || p.name).slice(0, 4990)
      return [
        '<item>',
        `<g:id>${xml(p.id)}</g:id>`,
        `<g:title>${xml(p.name.slice(0, 150))}</g:title>`,
        `<g:description>${xml(description)}</g:description>`,
        `<g:link>${xml(`${store.url}/product/${encodeURIComponent(p.slug)}`)}</g:link>`,
        `<g:image_link>${xml(images[0])}</g:image_link>`,
        ...images.slice(1, 10).map(url => `<g:additional_image_link>${xml(url)}</g:additional_image_link>`),
        `<g:availability>${p.soldOut ? 'out of stock' : 'in stock'}</g:availability>`,
        `<g:condition>new</g:condition>`,
        // Shown as a sale in the ad: the regular price crossed out next to the sale price.
        `<g:price>${xml(price(onSale ? p.compareAtPrice! : p.basePrice, store.currency))}</g:price>`,
        ...(onSale ? [`<g:sale_price>${xml(price(p.basePrice, store.currency))}</g:sale_price>`] : []),
        `<g:brand>${xml(p.brand || p.vendor || store.name)}</g:brand>`,
        '</item>',
      ].join('')
    })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(store.name)}</title><link>${xml(store.url)}</link><description>${xml(`${store.name} products`)}</description>\n${items.join('\n')}\n</channel></rss>\n`
}
