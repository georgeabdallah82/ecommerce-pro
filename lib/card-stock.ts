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
