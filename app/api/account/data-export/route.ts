import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

// "Download my data": the signed-in customer's own records as one JSON file. Only what belongs to
// them is included, and no secrets: no password hash, two-step login or session data.
export async function GET() {
  try {
    const user = await requireUser()
    const [account, addresses, orders, reviews, wishlist] = await Promise.all([
      db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, phone: true, createdAt: true } }),
      db.address.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { label: true, firstName: true, lastName: true, line1: true, line2: true, city: true, region: true, postalCode: true, country: true, phone: true, isDefault: true, createdAt: true },
      }),
      db.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          orderNumber: true, createdAt: true, status: true, paymentMethod: true, paymentStatus: true, currency: true,
          subtotal: true, discountTotal: true, shippingTotal: true, taxTotal: true, grandTotal: true,
          email: true, phone: true, shippingAddressJson: true, trackingNumber: true,
          items: { select: { name: true, sku: true, quantity: true, unitPrice: true, totalPrice: true } },
        },
      }),
      db.review.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { rating: true, title: true, body: true, approved: true, createdAt: true, product: { select: { name: true } } },
      }),
      db.wishlistItem.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, product: { select: { name: true } } },
      }),
    ])
    const exportedAt = new Date().toISOString()
    const payload = {
      exportedAt,
      account,
      addresses,
      orders: orders.map(({ shippingAddressJson, ...order }) => ({ ...order, shippingAddress: parseAddress(shippingAddressJson) })),
      reviews: reviews.map(r => ({ productName: r.product.name, rating: r.rating, title: r.title, body: r.body, approved: r.approved, createdAt: r.createdAt })),
      wishlist: wishlist.map(w => ({ productName: w.product.name, savedAt: w.createdAt })),
    }
    const day = exportedAt.slice(0, 10)
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="my-data-${day}.json"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Sign in to download your data' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    console.error('[account/data-export] failure', error)
    return json({ error: 'Unable to prepare your data' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

function parseAddress(value: string) {
  try { return JSON.parse(value) } catch { return null }
}
