// What must be right before a product or collection goes live, and whether a price is set up
// correctly. The product and collection editors show these checks, and the save routes enforce
// the price rule, so the two cannot drift apart.

export type CheckStatus = 'ok' | 'warn' | 'block'
// `tab` names the product editor tab where the fix is (see components/product-editor-v2.tsx).
export type ReadinessCheck = { id: string; label: string; status: CheckStatus; detail: string; tab?: string }

// A crossed-out price must be higher than the price it sits next to. No crossed-out price (or 0)
// means there is none.
export function priceProblem(basePrice: number | null | undefined, compareAtPrice: number | null | undefined): string {
  const base = Math.trunc(Number(basePrice) || 0)
  const compare = compareAtPrice == null ? 0 : Math.trunc(Number(compareAtPrice) || 0)
  if (compare > 0 && compare <= base) return 'The crossed-out price must be higher than the price. Raise it, or clear it.'
  return ''
}

export type ProductForReadiness = {
  name: string; sku: string; basePrice: number; compareAtPrice?: number | null
  description?: string | null; shortDescription?: string | null; status: string
  images: unknown[]; seoTitle?: string | null; seoDescription?: string | null
  collectionCount: number; publishedChannels: number
}

export function productReadiness(p: ProductForReadiness): ReadinessCheck[] {
  const checks: ReadinessCheck[] = []
  checks.push(p.name.trim()
    ? { id: 'title', label: 'Title', status: 'ok', detail: 'Named', tab: 'General' }
    : { id: 'title', label: 'Title', status: 'block', detail: 'Give the product a title', tab: 'General' })
  const pricing = priceProblem(p.basePrice, p.compareAtPrice)
  if (pricing) checks.push({ id: 'price-rule', label: 'Price', status: 'block', detail: pricing, tab: 'General' })
  else if (!(p.basePrice > 0)) checks.push({ id: 'price', label: 'Price', status: 'warn', detail: 'The price is 0, so customers see it as free', tab: 'General' })
  else checks.push({ id: 'price', label: 'Price', status: 'ok', detail: 'Priced', tab: 'General' })
  checks.push(p.sku.trim()
    ? { id: 'sku', label: 'SKU', status: 'ok', detail: 'Set', tab: 'Inventory' }
    : { id: 'sku', label: 'SKU', status: 'block', detail: 'Add a SKU so orders and stock can be tracked', tab: 'Inventory' })
  checks.push(p.images.length
    ? { id: 'photo', label: 'Photo', status: 'ok', detail: `${p.images.length} ${p.images.length === 1 ? 'photo' : 'photos'}`, tab: 'General' }
    : { id: 'photo', label: 'Photo', status: 'warn', detail: 'Add at least one photo; products without one sell less', tab: 'General' })
  checks.push((p.description || '').trim() || (p.shortDescription || '').trim()
    ? { id: 'description', label: 'Description', status: 'ok', detail: 'Written', tab: 'General' }
    : { id: 'description', label: 'Description', status: 'warn', detail: 'Add a description so customers know what they are buying', tab: 'General' })
  checks.push(p.collectionCount > 0
    ? { id: 'collection', label: 'Collection', status: 'ok', detail: `In ${p.collectionCount} ${p.collectionCount === 1 ? 'collection' : 'collections'}`, tab: 'General' }
    : { id: 'collection', label: 'Collection', status: 'warn', detail: 'Not in a collection, so it is found only by search', tab: 'General' })
  if (p.status === 'ACTIVE') checks.push({ id: 'status', label: 'Visibility', status: p.publishedChannels > 0 ? 'ok' : 'warn', detail: p.publishedChannels > 0 ? 'Active and on a sales channel' : 'Active, but not on any sales channel yet', tab: 'Channels' })
  else if (p.status === 'ARCHIVED') checks.push({ id: 'status', label: 'Visibility', status: 'block', detail: 'Archived: hidden from the store', tab: 'General' })
  else checks.push({ id: 'status', label: 'Visibility', status: 'warn', detail: 'Draft: customers cannot see it yet', tab: 'General' })
  checks.push((p.seoDescription || '').trim()
    ? { id: 'seo', label: 'Search listing', status: 'ok', detail: 'Description for search engines is set', tab: 'Search & SEO' }
    : { id: 'seo', label: 'Search listing', status: 'warn', detail: 'Add a search description for Google and social previews', tab: 'Search & SEO' })
  return checks
}

export type CollectionForReadiness = {
  name: string; slug: string; description?: string | null; imageUrl?: string | null; isActive: boolean
  products: { status: string }[]; seoDescription?: string | null
}

export function collectionReadiness(c: CollectionForReadiness): ReadinessCheck[] {
  const checks: ReadinessCheck[] = []
  checks.push(c.name.trim()
    ? { id: 'name', label: 'Name', status: 'ok', detail: 'Named' }
    : { id: 'name', label: 'Name', status: 'block', detail: 'Give the collection a name' })
  checks.push(c.slug.trim()
    ? { id: 'handle', label: 'Address', status: 'ok', detail: `/collections/${c.slug}` }
    : { id: 'handle', label: 'Address', status: 'block', detail: 'The address is empty' })
  checks.push(c.isActive
    ? { id: 'visibility', label: 'Visibility', status: 'ok', detail: 'Shown in the Online Store' }
    : { id: 'visibility', label: 'Visibility', status: 'warn', detail: 'Hidden: customers cannot open this collection' })
  const live = c.products.filter(p => p.status === 'ACTIVE').length
  const hidden = c.products.length - live
  if (!c.products.length) checks.push({ id: 'products', label: 'Products', status: 'warn', detail: 'No products yet, so the page would be empty' })
  else if (!live) checks.push({ id: 'products', label: 'Products', status: 'warn', detail: 'None of the products are active yet' })
  else if (hidden) checks.push({ id: 'products', label: 'Products', status: 'warn', detail: `${hidden} ${hidden === 1 ? 'product is' : 'products are'} not active, so ${hidden === 1 ? 'it does' : 'they do'} not show` })
  else checks.push({ id: 'products', label: 'Products', status: 'ok', detail: `${live} active ${live === 1 ? 'product' : 'products'}` })
  checks.push(c.imageUrl
    ? { id: 'image', label: 'Image', status: 'ok', detail: 'Set' }
    : { id: 'image', label: 'Image', status: 'warn', detail: 'Add an image for the collection banner and tiles' })
  checks.push((c.description || '').trim()
    ? { id: 'description', label: 'Description', status: 'ok', detail: 'Written' }
    : { id: 'description', label: 'Description', status: 'warn', detail: 'Add a description to introduce the collection' })
  checks.push((c.seoDescription || '').trim()
    ? { id: 'seo', label: 'Search listing', status: 'ok', detail: 'Search description set' }
    : { id: 'seo', label: 'Search listing', status: 'warn', detail: 'Add a search description so Google shows a useful summary' })
  return checks
}

// How many things block publishing and how many are worth a look.
export function summarizeReadiness(checks: ReadinessCheck[]) {
  return {
    blocks: checks.filter(c => c.status === 'block').length,
    warnings: checks.filter(c => c.status === 'warn').length,
    ready: checks.every(c => c.status === 'ok'),
  }
}
