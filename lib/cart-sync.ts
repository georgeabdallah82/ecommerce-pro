// Bringing a saved cart up to date with the store. Carts live in the shopper's browser, so a
// price change, an archived product or a sold-out size only showed up as a surprise at checkout
// (or, for cash on delivery, as a different amount at the door).

export type CartLineCheck = {
  productId: string
  variantId: string | null
  status: 'ok' | 'unavailable'
  price?: number
  // Units that can still be bought; null when stock isn't limited.
  available?: number | null
}

type SyncableItem = { productId: string; variantId?: string | null; name: string; price: number; quantity: number }

const lineKey = (productId: string, variantId?: string | null) => `${productId}:${variantId || 'default'}`

export function applyCartValidation<T extends SyncableItem>(items: T[], checks: CartLineCheck[]) {
  const byKey = new Map(checks.map(c => [lineKey(c.productId, c.variantId), c]))
  const changes: string[] = []
  const next: T[] = []
  for (const item of items) {
    const check = byKey.get(lineKey(item.productId, item.variantId))
    if (!check) { next.push(item); continue }
    if (check.status === 'unavailable' || check.available === 0) {
      changes.push(`${item.name} is no longer available and was removed.`)
      continue
    }
    let updated = item
    if (typeof check.price === 'number' && check.price !== item.price) {
      changes.push(`The price of ${item.name} changed.`)
      updated = { ...updated, price: check.price }
    }
    if (typeof check.available === 'number' && check.available < updated.quantity) {
      changes.push(`Only ${check.available} of ${item.name} left — your quantity was updated.`)
      updated = { ...updated, quantity: check.available }
    }
    next.push(updated)
  }
  return { items: next, changes }
}
