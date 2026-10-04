import { db } from '@/lib/prisma'

// What to look for when checking whether a file is still in use. Uploaded files are stored as
// /api/media/<key> (or /uploads/<key> in local dev) but may have been pasted elsewhere as a full
// address (https://store…/api/media/<key>), so for those the unique file key is matched instead.
export function mediaSearchTerm(url: string) {
  const local = url.match(/^(?:https?:\/\/[^/]+)?\/(?:api\/media|uploads)\/([^/?#]+)/)
  return local ? local[1] : url
}

// The R2 object key of an uploaded file, or null for a file that only links elsewhere.
export function mediaBucketKey(url: string) {
  const m = url.match(/^\/api\/media\/([^/?#]+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

// The theme (homepage sections, banners, header, page templates) is kept in settings.
function settingLabel(key: string) {
  if (/logo|favicon/i.test(key)) return 'Store logo or icon'
  if (/draft/i.test(key)) return 'Theme editor (unpublished changes)'
  if (/^(theme|templates?|navigation|pages?)\./i.test(key)) return 'Your live theme (homepage, banners or sections)'
  return 'Store settings'
}

// Where a file shows up in the store, as short labels for the admin ("Product: Baloo tissues").
export async function findMediaUsage(url: string, client: any = db): Promise<string[]> {
  const term = mediaSearchTerm(url)
  if (!term) return []
  const has = { contains: term }
  const take = 20
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
  const [images, products, collections, posts, pages, settings] = await Promise.all([
    safe(client.productImage.findMany({ where: { url: has }, select: { product: { select: { name: true } } }, take })),
    safe(client.product.findMany({ where: { OR: [{ seoImageUrl: has }, { description: has }] }, select: { name: true }, take })),
    safe(client.collection.findMany({ where: { OR: [{ imageUrl: has }, { description: has }] }, select: { name: true }, take })),
    safe(client.blogPost.findMany({ where: { OR: [{ featuredImage: has }, { bodyHtml: has }] }, select: { title: true }, take })),
    safe(client.page.findMany({ where: { bodyHtml: has }, select: { title: true }, take })),
    safe(client.setting.findMany({ where: { value: has }, select: { key: true }, take })),
  ])
  const labels = [
    ...images.map((i: any) => `Product: ${i.product?.name || 'a product'}`),
    ...products.map((p: any) => `Product: ${p.name}`),
    ...collections.map((c: any) => `Collection: ${c.name}`),
    ...posts.map((p: any) => `Blog post: ${p.title}`),
    ...pages.map((p: any) => `Page: ${p.title}`),
    ...settings.map((s: any) => settingLabel(String(s.key))),
  ]
  return [...new Set(labels)]
}
