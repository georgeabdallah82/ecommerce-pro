import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { getStoreCurrency } from '@/lib/store-currency'

// Public, unauthenticated capture endpoint for the checkout page -- distinct from
// /api/admin/abandoned-checkouts, which is staff-only and used to browse the
// results, not create them. The AbandonedCheckout admin UI has always existed
// with nothing ever writing to it (no idle timer, no beacon on the checkout
// page), so every abandoned cart was invisible. This is called on email blur
// during checkout and marks the row RECOVERED once an order is actually placed.

export async function POST(req: Request) {
  try {
    const limit = consumeRateLimit(`checkout-progress:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
    if (!limit.allowed) return json({ ok: false }, { status: 429 })

    const b = await req.json().catch(() => ({}))
    const token = String(b.token || '').trim().slice(0, 100)
    if (!token) return json({ error: 'token is required' }, { status: 400 })
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 190) : ''
    const items = Array.isArray(b.items) ? b.items.slice(0, 100) : []
    // Nothing worth recording yet -- not an error, just too early to capture.
    if (!email || !email.includes('@') || !items.length) return json({ ok: true })

    const cartItems = items.map((item: any) => ({
      productId: String(item.productId || ''),
      variantId: item.variantId ? String(item.variantId) : null,
      name: String(item.name || ''),
      quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
      unitPrice: Math.max(0, Math.trunc(Number(item.unitPrice) || 0)),
    })).filter((item: any) => item.productId)
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
