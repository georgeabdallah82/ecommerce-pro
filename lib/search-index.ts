import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import { getUnpublishedProductIds } from '@/lib/sales-channels'
import { getSellingConfig } from '@/lib/selling-config'
import { searchDocs, type SearchDoc } from '@/lib/smart-search'

// The searchable text of every product for sale (lib/smart-search.ts): name first, then brand,
// type, collections and tags, then the short description.
async function searchIndex(): Promise<SearchDoc[]> {
  return storefrontCached('search-index', async () => {
    const [hidden, products] = await Promise.all([
      getUnpublishedProductIds(),
      db.product.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, sku: true, brand: true, vendor: true, productType: true, shortDescription: true, tags: { select: { value: true } }, collections: { select: { collection: { select: { name: true } } } } },
        take: 5000,
      }),
    ])
    const skip = new Set(hidden)
    return products.filter(p => !skip.has(p.id)).map(p => ({
      id: p.id,
      fields: [
        { text: p.name, weight: 3 },
        { text: p.sku, weight: 2 },
        { text: [p.brand, p.vendor, p.productType].filter(Boolean).join(' '), weight: 2 },
        { text: p.collections.map(c => c.collection.name).join(' '), weight: 2 },
        { text: p.tags.map(t => t.value).join(' '), weight: 2 },
        { text: String(p.shortDescription || '').slice(0, 300), weight: 1 },
      ],
    }))
  })
}

export async function searchProductIds(query: string, limit = 200) {
  const [docs, selling] = await Promise.all([searchIndex(), getSellingConfig().catch(() => null)])
  return searchDocs(query, docs, selling?.searchWords || '', limit)
}
