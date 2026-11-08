// The till's rules, kept free of Next.js and the database so they can be tested.
// Money is in cents, the same unit as the rest of the store.

export type TillProductInput = {
  id: string
  title: string
  sku: string
  barcode: string | null
  basePrice: number
  variants: Array<{ id: string; title: string; sku: string; barcode: string | null; price: number | null }>
}

export type StockRow = { productId: string; variantId: string | null; quantity: number; reserved: number }

/** Something a cashier can sell: a product without variants, or one variant of a product. */
export type TillItem = {
  key: string
  productId: string
  variantId: string | null
  title: string
  sku: string
  barcode: string | null
  unitPrice: number
  available: number
}

export type TillLine = TillItem & { quantity: number }

export function itemKey(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? ''}`
}

/** Units that can be sold now: on hand minus what online orders have already reserved. */
export function availableStock(rows: StockRow[], productId: string, variantId: string | null) {
  return rows
    .filter(row => row.productId === productId && (row.variantId ?? null) === variantId)
    .reduce((sum, row) => sum + Math.max(0, row.quantity - row.reserved), 0)
}

/** Flattens products into sellable items: one per variant, or one for a product without variants. */
export function tillItems(products: TillProductInput[], stock: StockRow[]): TillItem[] {
  const items: TillItem[] = []
  for (const product of products) {
    if (product.variants.length === 0) {
      items.push({
        key: itemKey(product.id, null), productId: product.id, variantId: null, title: product.title,
        sku: product.sku, barcode: product.barcode, unitPrice: product.basePrice,
        available: availableStock(stock, product.id, null),
      })
      continue
    }
    for (const variant of product.variants) {
      items.push({
        key: itemKey(product.id, variant.id), productId: product.id, variantId: variant.id,
        title: variant.title === 'Default' || !variant.title ? product.title : `${product.title} · ${variant.title}`,
        sku: variant.sku, barcode: variant.barcode, unitPrice: variant.price ?? product.basePrice,
        available: availableStock(stock, product.id, variant.id),
      })
    }
  }
  return items
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

/** The item a scanner or typed code points to: an exact barcode or SKU match, ignoring case. */
export function findByCode(items: TillItem[], code: string): TillItem | null {
  const wanted = normalize(code)
  if (!wanted) return null
  return items.find(item => normalize(item.barcode ?? '') === wanted || normalize(item.sku) === wanted) ?? null
}

/** Items whose title or code contains every word typed, shortest title first. */
export function searchItems(items: TillItem[], query: string, limit = 20): TillItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return items
    .filter(item => {
      const haystack = normalize(`${item.title} ${item.sku} ${item.barcode ?? ''}`)
      return words.every(word => haystack.includes(word))
    })
    .sort((a, b) => a.title.length - b.title.length)
    .slice(0, limit)
}

/** Adds one unit (or more) of an item. A line can never exceed the stock available now. */
export function addToTill(lines: TillLine[], item: TillItem, quantity = 1): TillLine[] {
  const existing = lines.find(line => line.key === item.key)
  const current = existing?.quantity ?? 0
  const wanted = Math.max(0, current + quantity)
  const capped = Math.min(wanted, item.available)
  if (capped <= 0) return lines
  if (existing && existing.quantity === capped) return lines
  if (existing) return lines.map(line => (line.key === item.key ? { ...line, quantity: capped, available: item.available } : line))
  return [...lines, { ...item, quantity: capped }]
}

/** Sets a line's quantity. Zero or less removes the line; more than the stock available is capped. */
export function setQuantity(lines: TillLine[], key: string, quantity: number): TillLine[] {
  if (quantity < 1) return lines.filter(line => line.key !== key)
  return lines.map(line => (line.key === key ? { ...line, quantity: Math.min(quantity, line.available) } : line))
}

export function tillTotals(lines: TillLine[]) {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  return { units, subtotal }
}
