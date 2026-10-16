// Inventory > What to reorder: how fast each product sells, how long its stock lasts, and how
// many to buy so it lasts the chosen number of days. Plain maths, shared with tests.

export const REORDER_SALES_DAYS = 30
export const REORDER_COVER_DAYS = [14, 30, 60] as const

export type ReorderStock = {
  key: string // productId:variantId
  productId: string
  name: string
  variant: string
  sku: string
  supplier: string
  cost: number | null // cost per unit, cents
  available: number // in stock, minus what open orders hold
  threshold: number
}
export type ReorderSale = { productId: string; variantId: string | null; quantity: number }
export type ReorderRow = ReorderStock & { sold: number; perDay: number; daysLeft: number | null; suggested: number }

export const stockKey = (productId: string, variantId: string | null | undefined) => `${productId}:${variantId || ''}`

// Products to buy: at their low-stock level, or selling fast enough to run out within the chosen
// days. Sold out first, then the ones that run out soonest. `daysLeft` is null when nothing sold
// (no way to tell).
export function reorderList(stock: ReorderStock[], sales: ReorderSale[], options: { salesDays?: number; coverDays: number }): ReorderRow[] {
  const salesDays = options.salesDays || REORDER_SALES_DAYS
  const sold = new Map<string, number>()
  for (const sale of sales) sold.set(stockKey(sale.productId, sale.variantId), (sold.get(stockKey(sale.productId, sale.variantId)) || 0) + sale.quantity)
  const rows: ReorderRow[] = []
  for (const item of stock) {
    const units = sold.get(item.key) || 0
    const low = item.available <= item.threshold
    if (!units && !low) continue
    const perDay = units / salesDays
    const daysLeft = perDay > 0 ? Math.max(0, item.available) / perDay : null
    const forCover = Math.ceil(perDay * options.coverDays) - item.available
    const toThreshold = low ? item.threshold + 1 - item.available : 0
    const suggested = Math.max(0, forCover, toThreshold)
    if (!low && !suggested) continue
    rows.push({ ...item, sold: units, perDay, daysLeft, suggested })
  }
  return rows.sort((a, b) => {
    const outA = a.available <= 0 ? 0 : 1, outB = b.available <= 0 ? 0 : 1
    if (outA !== outB) return outA - outB
    const da = a.daysLeft ?? Number.POSITIVE_INFINITY, dbb = b.daysLeft ?? Number.POSITIVE_INFINITY
    return da - dbb || b.sold - a.sold || a.name.localeCompare(b.name)
  })
}

export function groupBySupplier(rows: ReorderRow[]) {
  const groups = new Map<string, ReorderRow[]>()
  for (const row of rows) groups.set(row.supplier || 'No supplier', [...(groups.get(row.supplier || 'No supplier') || []), row])
  return [...groups.entries()].map(([supplier, list]) => ({ supplier, rows: list })).sort((a, b) => (a.supplier === 'No supplier' ? 1 : 0) - (b.supplier === 'No supplier' ? 1 : 0) || a.supplier.localeCompare(b.supplier))
}

// The message for the supplier (copied or sent on WhatsApp).
export function supplierOrderMessage(storeName: string, lines: Array<{ name: string; variant: string; sku: string; quantity: number }>) {
  return [
    `Hello${storeName ? `, this is ${storeName}` : ''}. I would like to order:`,
    '',
    ...lines.filter(l => l.quantity > 0).map(l => `- ${l.quantity} x ${l.name}${l.variant ? ` (${l.variant})` : ''}${l.sku ? ` [${l.sku}]` : ''}`),
    '',
    'Thank you!',
  ].join('\n')
}

export function daysLeftText(row: Pick<ReorderRow, 'available' | 'daysLeft'>) {
  if (row.available <= 0) return 'Sold out'
  if (row.daysLeft === null) return 'Low stock, no recent sales'
  if (row.daysLeft < 1) return 'Runs out today'
  const d = Math.round(row.daysLeft)
  return `About ${d} day${d === 1 ? '' : 's'} left`
}
