// Small pure helpers for the admin product editor and products list (components/product-editor-v2.tsx,
// components/admin-products-list.tsx), kept apart from the components so they can be tested
// (docs/admin-product-editor-2026-11.md).

// One option's values as typed: "S, M, L". Split on commas, trimmed, with blanks and repeats (in any case)
// dropped. The box keeps the text exactly as typed and only this reading of it builds variants: a box bound to
// the parsed list dropped each comma the moment it was typed, so "S, M, L" typed key by key came out as "SML".
export function parseOptionValues(text: string): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const part of text.split(',')) {
    const value = part.trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    values.push(value)
  }
  return values
}

// Tags typed in the tag box and added with Enter: "summer, gift" adds two. Blanks and tags the product already
// has (in any case) are skipped.
export function tagsFromInput(text: string, existing: string[]): string[] {
  const have = new Set(existing.map(tag => tag.toLowerCase()))
  const tags: string[] = []
  for (const part of text.split(',')) {
    const tag = part.trim()
    if (!tag || have.has(tag.toLowerCase())) continue
    have.add(tag.toLowerCase())
    tags.push(tag)
  }
  return tags
}

// Profit per item and margin (a whole percent) from the price and the cost per item, both in cents. Null without
// a price or a cost. Below cost both are negative: the editor used to show 0% there.
export function pricingSummary(price: number | null | undefined, cost: number | null | undefined): { profit: number; margin: number } | null {
  const p = Number(price) || 0
  const c = Number(cost) || 0
  if (p <= 0 || c <= 0) return null
  const profit = p - c
  return { profit, margin: Math.round((profit / p) * 100) }
}

// The channels a product is on: every active channel, unless the product was taken off it (a publication row
// with available: false). A product nobody has changed has no publication rows and is on every channel, as the
// storefront reads it (lib/sales-channels.ts).
export function channelsShowing<T extends { id: string }>(channels: T[], publications: { channelId: string; available: boolean }[]): T[] {
  return channels.filter(channel => publications.find(p => p.channelId === channel.id)?.available !== false)
}

// The products list's views (All, Active, Draft, Archived) and how many products each holds for the current
// search, whichever view is open. They were counted from the rows on screen, so on the Draft view Active read 0.
export const PRODUCT_VIEWS = ['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const
export type ProductView = typeof PRODUCT_VIEWS[number]
export type ProductViewCounts = Record<ProductView, number>

export async function productViewCounts(
  count: (args: { where: Record<string, unknown> }) => Promise<number>,
  where: Record<string, unknown> = {},
): Promise<ProductViewCounts> {
  const [all, active, draft] = await Promise.all([
    count({ where }),
    count({ where: { ...where, status: 'ACTIVE' } }),
    count({ where: { ...where, status: 'DRAFT' } }),
  ])
  return { ALL: all, ACTIVE: active, DRAFT: draft, ARCHIVED: Math.max(0, all - active - draft) }
}

// Gives each products-list row the channels it was taken off (publication rows with available: false), read in
// one query beside the rows: ProductPublication has no relation on Product to include it through.
export function withChannelOptOuts<T extends { id: string }>(rows: T[], optOuts: { productId: string; channelId: string }[]): (T & { publications: { channelId: string; available: boolean }[] })[] {
  return rows.map(row => ({ ...row, publications: optOuts.filter(p => p.productId === row.id).map(p => ({ channelId: p.channelId, available: false })) }))
}
