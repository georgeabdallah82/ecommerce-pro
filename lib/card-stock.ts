// What product cards need to sell a product correctly: its options (id, name, price) and
// whether each one can still be bought. Cards on the homepage, shop, collections, cart and
// product pages add straight to the cart, so without this a product with sizes went in with no
// size, and a sold-out one only disappeared again once the cart was re-checked.

export const CARD_STOCK_INCLUDE = {
  variants: { select: { id: true, name: true, sku: true, price: true, compareAtPrice: true } },
  inventory: { select: { variantId: true, quantity: true, reserved: true } },
} as const

type StockRow = { variantId: string | null; quantity: number; reserved: number }
type CardSource = {
  trackInventory?: boolean | null
  continueSellingWhenOutOfStock?: boolean | null
  inventory?: StockRow[] | null
  variants?: Array<{ id: string } & Record<string, unknown>> | null
}

// Same rule as checkout: an option's own stock rows, or else the product's shared rows.
function unitsLeft(rows: StockRow[], variantId: string | null) {
  const dedicated = variantId ? rows.filter(r => r.variantId === variantId) : []
  const use = dedicated.length ? dedicated : rows.filter(r => !r.variantId)
  return use.reduce((sum, r) => sum + Number(r.quantity || 0) - Number(r.reserved || 0), 0)
}

// Adds `available` to each option (null when stock isn't limited) and `soldOut` to the
// product, and drops the raw stock rows so they never reach the browser.
export type CardVariant = { id: string; available: number | null } & Record<string, unknown>
export function withCardStock<T extends CardSource>(products: T[]): Array<Omit<T, 'inventory' | 'variants'> & { variants: CardVariant[]; soldOut: boolean }> {
  return products.map(product => {
    const { inventory, ...rest } = product
    const rows = inventory || []
    const limited = product.trackInventory !== false && !product.continueSellingWhenOutOfStock
    const variants: CardVariant[] = (product.variants || []).map(v => ({ ...v, available: limited ? Math.max(0, unitsLeft(rows, v.id)) : null }))
    const soldOut = limited && (variants.length ? variants.every(v => v.available === 0) : unitsLeft(rows, null) <= 0)
    return { ...rest, variants, soldOut } as unknown as Omit<T, 'inventory' | 'variants'> & { variants: CardVariant[]; soldOut: boolean }
  })
}

// What the shopper can still buy, for the product as a whole and for each option, by the same rule
// checkout uses. withCardStock only counts stock while it is limited; a pre-order needs the real count.
export function stockLeft(source: { inventory?: StockRow[] | null; variants?: Array<{ id: string }> | null }) {
  const rows = source.inventory || []
  const variants = (source.variants || []).map(v => ({ id: v.id, available: Math.max(0, unitsLeft(rows, v.id)) }))
  const product = variants.length ? Math.max(0, ...variants.map(v => v.available)) : Math.max(0, unitsLeft(rows, null))
  return { product, variants }
}

// How a product reads to a shopper and to search engines. A pre-order is a product setting that keeps
// it selling at zero stock, so it only shows once the stock is gone (the product page says "Pre-order").
export type StockState = 'in_stock' | 'out_of_stock' | 'preorder'
export function stockState({ available, trackInventory, continueSellingWhenOutOfStock, preorder }: {
  available: number
  trackInventory?: boolean | null
  continueSellingWhenOutOfStock?: boolean | null
  preorder?: boolean | null
}): StockState {
  const sellsWithoutStock = trackInventory === false || !!continueSellingWhenOutOfStock
  if (!sellsWithoutStock && available <= 0) return 'out_of_stock'
  return preorder && trackInventory !== false && available <= 0 ? 'preorder' : 'in_stock'
}

// The same state written for search engines (schema.org Offer) and for share links (product:availability).
export const SCHEMA_AVAILABILITY: Record<StockState, string> = {
  in_stock: 'https://schema.org/InStock',
  out_of_stock: 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
}
export const SHARE_AVAILABILITY: Record<StockState, string> = {
  in_stock: 'in stock',
  out_of_stock: 'out of stock',
  preorder: 'preorder',
}
