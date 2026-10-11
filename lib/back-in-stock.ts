import { db } from '@/lib/prisma'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import { parsePushSubscription } from '@/lib/push-opt-in'
import { sendPushToDevice } from '@/lib/push'
import { sendBackInStockEmail } from '@/lib/email'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

// "Notify me when it's back" on a sold-out product page (components/back-in-stock-button.tsx).
// The customer leaves this browser (a push notification) or an email address; when the product or
// the option they wanted can be bought again, they're told once and the request is deleted.
// Requests are checked whenever stock goes up (a product saved, an inventory adjustment, a
// purchase order received, a return restocked), not on a timer, so the database can sleep.

export const MAX_EMAIL_LENGTH = 254

export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email || email.length > MAX_EMAIL_LENGTH) return null
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null
}

// One request per product, option and browser or email address.
export function backInStockKey(productId: string, variantId: string | null, target: { endpoint: string } | { email: string }) {
  return `${productId}:${variantId || '-'}:${'endpoint' in target ? `push:${target.endpoint}` : `email:${target.email}`}`
}

type StockProduct = Parameters<typeof withCardStock>[0][number]

// Whether the customer can buy what they asked for: their option, or for a request without one
// (a product without options), the product.
export function canBuyAgain(product: StockProduct, variantId: string | null): boolean {
  const [card] = withCardStock([product])
  if (!variantId) return !card.soldOut
  const variant = card.variants.find(v => v.id === variantId)
  // An option deleted since then: tell them when anything of the product is back.
  if (!variant) return !card.soldOut
  return variant.available === null || variant.available > 0
}

export type BackInStockInput = { productId: unknown; variantId?: unknown; subscription?: unknown; email?: unknown }

// Saves a request from the storefront. Throws a message the customer can read.
export async function requestBackInStock(input: BackInStockInput, userId: string | null) {
  const productId = String(input.productId ?? '').trim()
  const variantId = String(input.variantId ?? '').trim() || null
  if (!productId) throw new Error('Choose a product first.')
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, trackInventory: true, continueSellingWhenOutOfStock: true, ...CARD_STOCK_INCLUDE },
  })
  if (!product || product.status !== 'ACTIVE') throw new Error('This product is not available.')
  if (variantId && !product.variants.some(v => v.id === variantId)) throw new Error('This option is not available.')
  if (canBuyAgain(product, variantId)) return { inStock: true as const }

  let target: { endpoint: string; p256dh: string; auth: string } | { email: string }
  if (input.subscription) {
    target = parsePushSubscription(input.subscription)
  } else {
    const email = normalizeEmail(input.email)
    if (!email) throw new Error('Please enter a valid email address.')
    target = { email }
  }
  const dedupeKey = backInStockKey(product.id, variantId, 'email' in target ? { email: target.email } : { endpoint: target.endpoint })
  const data = { productId: product.id, variantId, userId, ...target }
  await db.backInStockRequest.upsert({ where: { dedupeKey }, update: data, create: { ...data, dedupeKey } })
  return { inStock: false as const }
}

// Tells everyone waiting for these products whose option can be bought now. Safe to call often:
// with nobody waiting it's one small query.
export async function sendBackInStockAlerts(productIds: Iterable<string>) {
  const ids = [...new Set(productIds)].filter(Boolean)
  if (!ids.length) return { sent: 0 }
  const requests = await db.backInStockRequest.findMany({ where: { productId: { in: ids } }, orderBy: { createdAt: 'asc' }, take: 500 })
  if (!requests.length) return { sent: 0 }

  const [products, unpublished] = await Promise.all([
    db.product.findMany({
      where: { id: { in: [...new Set(requests.map(r => r.productId))] }, status: 'ACTIVE' },
      select: {
        id: true, name: true, slug: true, trackInventory: true, continueSellingWhenOutOfStock: true, ...CARD_STOCK_INCLUDE,
        images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    }),
    getUnpublishedProductIds(),
  ])
  const byId = new Map(products.filter(p => !unpublished.includes(p.id)).map(p => [p.id, p]))

  let sent = 0
  for (const request of requests) {
    const product = byId.get(request.productId)
    if (!product || !canBuyAgain(product, request.variantId)) continue
    const variantName = request.variantId ? product.variants.find(v => v.id === request.variantId)?.name : undefined
    const name = variantName ? `${product.name} (${variantName})` : product.name
    const image = product.images[0]?.url
    let outcome: 'sent' | 'gone' | 'failed' | 'skipped'
    if (request.endpoint && request.p256dh && request.auth) {
      outcome = await sendPushToDevice({ endpoint: request.endpoint, p256dh: request.p256dh, auth: request.auth }, {
        title: 'Back in stock',
        body: `${name} is available again. Order before it sells out.`,
        url: `/product/${product.slug}`,
        ...(image ? { icon: image } : {}),
        marketing: true,
        tag: `back-in-stock-${product.id}`,
      })
    } else if (request.email) {
      const result = await sendBackInStockEmail(request.email, { name, slug: product.slug, image })
      outcome = result.sent ? 'sent' : result.skipped ? 'skipped' : 'failed'
    } else {
      outcome = 'gone'
    }
    // Told (or the browser is gone): done. A failed send stays for the next restock.
    if (outcome === 'sent' || outcome === 'gone') await db.backInStockRequest.delete({ where: { id: request.id } }).catch(() => undefined)
    if (outcome === 'sent') sent += 1
  }
  return { sent }
}

// After stock changes that only know which inventory rows moved.
export async function sendBackInStockForInventory(inventoryIds: Iterable<string>) {
  const ids = [...new Set(inventoryIds)].filter(Boolean)
  if (!ids.length) return { sent: 0 }
  const rows = await db.inventoryItem.findMany({ where: { id: { in: ids }, product: { backInStockRequests: { some: {} } } }, select: { productId: true } })
  return sendBackInStockAlerts(rows.map(row => row.productId))
}

// How many customers are waiting for each of these products (admin product page).
export async function countBackInStockRequests(productId: string) {
  return db.backInStockRequest.count({ where: { productId } })
}
