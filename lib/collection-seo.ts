import { metaText } from '@/lib/seo'

// How a collection reads to search engines and in a shared link. The search title and description
// the merchant wrote in the collection editor win; the collection's own name and description are
// the fallback, then a plain shop line.
export function collectionSeo(
  collection: { name: string; description?: string | null; seoTitle?: string | null; seoDescription?: string | null },
  brand?: string | null,
): { title: string; description: string | undefined } {
  const title = String(collection.seoTitle ?? '').replace(/\s+/g, ' ').trim() || collection.name
  const description = metaText(collection.seoDescription)
    || metaText(collection.description)
    || metaText(`Shop ${collection.name} at ${brand || 'our store'}.`)
  return { title, description }
}

// Google reads the products on a collection page as an item list, in the order they're shown.
// Only the first ones are listed (numberOfItems stays the full count) so a very large collection
// doesn't bloat the page.
export const COLLECTION_LIST_LIMIT = 50

export function collectionListJsonLd({ name, slug, base, description, products }: {
  name: string
  slug: string
  base: string
  description?: string
  products: Array<{ name: string; slug: string }>
}) {
  if (!products.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: `${base}/collections/${slug}`,
    ...(description ? { description } : {}),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.slice(0, COLLECTION_LIST_LIMIT).map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.name,
        url: `${base}/product/${product.slug}`,
      })),
    },
  }
}
