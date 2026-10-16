// Products > Change prices: raise or lower many prices at once (a whole collection, a supplier,
// or chosen products), see every new price before anything is saved, and undo the last change.
// Prices are in cents. Options that have their own price change too; options that use the
// product's price follow it.

export type PriceMode = 'up-percent' | 'down-percent' | 'up-amount' | 'down-amount' | 'set'
export type Rounding = 'none' | 'whole' | 'ninety-nine'
export type CompareAtRule = 'keep' | 'same' | 'remove'
export type PriceChange = { mode: PriceMode; value: number; rounding: Rounding; compareAt: CompareAtRule }

export const PRICE_MODES: Array<{ id: PriceMode; label: string; unit: '%' | 'money' }> = [
  { id: 'up-percent', label: 'Raise by %', unit: '%' },
  { id: 'down-percent', label: 'Lower by %', unit: '%' },
  { id: 'up-amount', label: 'Raise by an amount', unit: 'money' },
  { id: 'down-amount', label: 'Lower by an amount', unit: 'money' },
  { id: 'set', label: 'Set to one price', unit: 'money' },
]

const MAX_PRICE = 100_000_000 // $1,000,000

// `value` is a percent for the % modes, cents for the others.
export function changeError(change: PriceChange) {
  const v = change.value
  if (!Number.isFinite(v) || v <= 0) return 'Type how much to change the prices by'
  if (change.mode === 'down-percent' && v >= 100) return 'Lowering by 100% or more would make prices free'
  if ((change.mode === 'up-percent') && v > 1000) return 'That is more than 10 times the price. Check the number.'
  if (change.mode !== 'up-percent' && change.mode !== 'down-percent' && v > MAX_PRICE) return 'That amount is too big'
  return ''
}

export function roundPrice(cents: number, rounding: Rounding) {
  if (rounding === 'whole') return Math.max(100, Math.round(cents / 100) * 100)
  // The nearest whole amount, minus one cent: 12.30 -> 11.99, 12.60 -> 12.99.
  if (rounding === 'ninety-nine') return Math.max(99, Math.round(cents / 100) * 100 - 1)
  return Math.round(cents)
}

export function newPrice(cents: number, change: Pick<PriceChange, 'mode' | 'value' | 'rounding'>) {
  const v = change.value
  const raw = change.mode === 'up-percent' ? cents * (1 + v / 100)
    : change.mode === 'down-percent' ? cents * (1 - v / 100)
      : change.mode === 'up-amount' ? cents + v
        : change.mode === 'down-amount' ? cents - v
          : v
  return Math.min(MAX_PRICE, roundPrice(raw, change.rounding))
}

// The "was" price shown crossed out: kept, moved by the same change, or removed. A "was" price
// that would end up at or under the new price is dropped (it would read as no discount).
export function newCompareAt(compareAt: number | null, price: number, change: PriceChange) {
  if (compareAt == null || change.compareAt === 'remove') return null
  const next = change.compareAt === 'same' && change.mode !== 'set' ? newPrice(compareAt, change) : compareAt
  return next > price ? next : null
}

export type PricedItem = { kind: 'product' | 'variant'; id: string; productId: string; name: string; variant: string; price: number; compareAt: number | null; cost: number | null }
export type PricePreview = PricedItem & { newPrice: number; newCompareAt: number | null; belowCost: boolean; problem: string }

export function previewPrices(items: PricedItem[], change: PriceChange): PricePreview[] {
  return items.map(item => {
    const price = newPrice(item.price, change)
    const compareAt = newCompareAt(item.compareAt, price, change)
    const problem = price < 1 ? 'The new price would be zero or less' : ''
    return { ...item, newPrice: price, newCompareAt: compareAt, belowCost: item.cost != null && item.cost > 0 && price < item.cost, problem }
  })
}

// What to put back with Undo: the prices before the change, and what they were changed to, so
// a price someone edited by hand since is left alone.
export const LAST_PRICE_CHANGE_KEY = 'products.lastPriceChange'
export type PriceUndo = {
  at: string; by: string; summary: string
  items: Array<{ kind: 'product' | 'variant'; id: string; price: number; compareAt: number | null; newPrice: number; newCompareAt: number | null }>
}

export function describeChange(change: PriceChange, money: (cents: number) => string) {
  const v = change.mode.endsWith('percent') ? `${change.value}%` : money(change.value)
  const what = change.mode === 'up-percent' || change.mode === 'up-amount' ? `Raised by ${v}` : change.mode === 'set' ? `Set to ${v}` : `Lowered by ${v}`
  const rounding = change.rounding === 'whole' ? ', rounded to whole amounts' : change.rounding === 'ninety-nine' ? ', ending in .99' : ''
  return `${what}${rounding}`
}
