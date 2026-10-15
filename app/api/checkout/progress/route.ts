import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { getStoreCurrency } from '@/lib/store-currency'
import { runInBackground } from '@/lib/background'
import { maybeSendCartReminders } from '@/lib/cart-reminders'
import { sendAbandonedCheckoutEmail } from '@/lib/email'

// Public, unauthenticated capture endpoint for the checkout page -- distinct from
// /api/admin/abandoned-checkouts, which is staff-only and used to browse the
// results, not create them. The AbandonedCheckout admin UI has always existed
// with nothing ever writing to it (no idle timer, no beacon on the checkout
// page), so every abandoned cart was invisible. This is called on email blur
// during checkout and marks the row RECOVERED once an order is actually placed.

export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`checkout-progress:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
    if (!limit.allowed) return json({ ok: false }, { status: 429 })

    const b = await req.json().catch(() => ({}))
    const token = String(b.token || '').trim().slice(0, 100)
    if (!token) return json({ error: 'token is required' }, { status: 400 })
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 190) : ''
    const items = Array.isArray(b.items) ? b.items.slice(0, 100) : []
    // Nothing worth recording yet -- not an error, just too early to capture.
    if (!email || !email.includes('@') || !items.length) return json({ ok: true })

    // Names and prices come from the catalogue, not the browser (audit ME-04): the admin's
    // abandoned-cart list and the recovered cart must show real prices, whatever was sent.
    type Requested = { productId: string; variantId: string | null; quantity: number }
    const requested: Requested[] = items.map((item: any) => ({
      productId: String(item.productId || '').slice(0, 100),
      variantId: item.variantId ? String(item.variantId).slice(0, 100) : null,
      quantity: Math.min(99, Math.max(1, Math.trunc(Number(item.quantity) || 1))),
    })).filter((item: Requested) => item.productId)
    if (!requested.length) return json({ ok: true })
    const productIds = [...new Set(requested.map(i => i.productId))]
    const variantIds = [...new Set(requested.map(i => i.variantId).filter((v): v is string => !!v))]
    const [products, variants] = await Promise.all([
      db.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' }, select: { id: true, name: true, basePrice: true } }),
      variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true, name: true, price: true } }) : Promise.resolve([]),
    ])
    const productById = new Map(products.map(p => [p.id, p]))
    const variantById = new Map(variants.map(v => [v.id, v]))
    const cartItems = requested.flatMap(item => {
      const product = productById.get(item.productId)
      if (!product) return []
      const variant = item.variantId ? variantById.get(item.variantId) : null
      if (item.variantId && (!variant || variant.productId !== product.id)) return []
      const name = variant && variant.name && variant.name !== 'Default Title' ? `${product.name} – ${variant.name}` : product.name
      return [{ productId: product.id, variantId: variant?.id ?? null, name, quantity: item.quantity, unitPrice: Math.max(0, variant?.price ?? product.basePrice) }]
    })
    if (!cartItems.length) return json({ ok: true })

    const subtotal = cartItems.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0)
    const currency = await getStoreCurrency()
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    const user = await getCurrentUser()

    // The recovery link has to carry this token, or the recovery email's "pick up where you
    // left off" is a lie -- app/checkout/page.tsx reads ?recover=<token> to fetch this exact
    // cart back via the GET handler below and re-add it, which a bare /checkout link can't do.
    const recoveryUrl = siteUrl ? `${siteUrl}/checkout?recover=${encodeURIComponent(token)}` : null
    await db.abandonedCheckout.upsert({
      where: { token },
      update: { customerId: user?.id ?? null, email, cartJson: JSON.stringify(cartItems), subtotal, currency, recoveryUrl, status: 'OPEN', lastActivity: new Date() },
      create: { token, customerId: user?.id ?? null, email, cartJson: JSON.stringify(cartItems), subtotal, currency, recoveryUrl },
    })
    // The database is awake anyway: a good moment for the (rare, throttled) reminder check.
    runInBackground(maybeSendCartReminders(sendAbandonedCheckoutEmail))
    return json({ ok: true })
  } catch {
    return json({ ok: false }, { status: 400 })
  }
}

// Public, unauthenticated lookup by token -- powers the recovery link's cart rehydration on
// the checkout page. Only ever returns the cart for a still-OPEN capture (never a RECOVERED
// or otherwise stale one), and returns a null cart rather than an error for any not-found/
// expired/malformed token so a stale or already-used recovery link just degrades to a normal
// empty checkout instead of erroring.
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token')?.trim().slice(0, 100) || ''
    if (!token || token.length < 8) return json({ cart: null })
    const row = await db.abandonedCheckout.findUnique({ where: { token } })
    if (!row || row.status !== 'OPEN') return json({ cart: null })
    let items: unknown[] = []
    try { items = JSON.parse(row.cartJson || '[]') } catch { items = [] }
    if (!Array.isArray(items) || !items.length) return json({ cart: null })
    return json({ cart: { items, subtotal: row.subtotal, currency: row.currency, email: row.email } })
  } catch {
    return json({ cart: null })
  }
}

export async function PATCH(req: Request) {
  try {
    const b = await req.json().catch(() => ({}))
    const token = String(b.token || '').trim().slice(0, 100)
    if (!token) return json({ ok: true })
    await db.abandonedCheckout.updateMany({ where: { token, status: 'OPEN' }, data: { status: 'RECOVERED', recoveredAt: new Date() } })
    return json({ ok: true })
  } catch {
    return json({ ok: false }, { status: 400 })
  }
}
