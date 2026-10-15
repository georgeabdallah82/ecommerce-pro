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

// `t` puts the notices in the shopper's language (components/lang-provider.tsx); English without it.
export function applyCartValidation<T extends SyncableItem>(items: T[], checks: CartLineCheck[], t: (text: string, vars?: Record<string, string | number>) => string = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m))) {
  const byKey = new Map(checks.map(c => [lineKey(c.productId, c.variantId), c]))
  const changes: string[] = []
  const next: T[] = []
  for (const item of items) {
    const check = byKey.get(lineKey(item.productId, item.variantId))
    if (!check) { next.push(item); continue }
    if (check.status === 'unavailable' || check.available === 0) {
      changes.push(t('{name} is no longer available and was removed.', { name: item.name }))
      continue
    }
    let updated = item
    if (typeof check.price === 'number' && check.price !== item.price) {
      changes.push(t('The price of {name} changed.', { name: item.name }))
      updated = { ...updated, price: check.price }
    }
    if (typeof check.available === 'number' && check.available < updated.quantity) {
      changes.push(t('Only {n} of {name} left. Your quantity was updated.', { n: check.available, name: item.name }))
      updated = { ...updated, quantity: check.available }
    }
    next.push(updated)
  }
  return { items: next, changes }
}
