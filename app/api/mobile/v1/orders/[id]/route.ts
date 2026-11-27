import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { publicUserSelect } from '@/lib/user-public'
import { customerName, nextStatuses, parseAddress } from '@/lib/mobile-orders'
import { WHATSAPP_OUTCOMES, whatsappConfirmLink, whatsappPhoneProblem } from '@/lib/whatsapp-confirm'
import { getStoreIdentity } from '@/lib/store-identity'
import { money } from '@/lib/config'

const noStore = { 'Cache-Control': 'private, no-store' }

// One order for the Android admin app: the same facts the web's order page loads
// (app/admin/orders/[id]/page.tsx), shaped for the phone. Changes go through the web's own
// endpoint, PATCH /api/admin/orders, so every rule (stock, refunds, emails, WhatsApp, webhooks)
// is the same whichever screen made them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('orders.view')
    const { id } = await params
    if (!id || id.length > 100) return json({ error: 'Order not found' }, { status: 404, headers: noStore })
    const order = await db.order.findUnique({
      where: { id },
      include: {
        user: { select: publicUserSelect },
        driver: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, slug: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: { select: { id: true, name: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
        notesHistory: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 },
        paymentTransactions: { select: { id: true, provider: true, status: true, amount: true, currency: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        paymentProofs: { select: { id: true, createdAt: true, sizeBytes: true }, orderBy: { createdAt: 'desc' } },
      },
    })
    if (!order) return json({ error: 'Order not found' }, { status: 404, headers: noStore })
    const fulfillments = await db.fulfillment.findMany({ where: { orderId: order.id }, select: { id: true, status: true, trackingNumber: true, trackingCompany: true, trackingUrl: true, shippedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
    const canManage = hasPermission(user, 'orders.manage')
    const store = await getStoreIdentity()
    // The WhatsApp "please confirm your order" chat, with the message ready (lib/whatsapp-confirm.ts, as on the web).
    const confirmOrder = { ...order, items: order.items.map(item => ({ name: item.name, quantity: item.quantity, variant: item.variant })) }
    const whatsappLink = whatsappConfirmLink(confirmOrder, store.name, store.country, money) || null
    const refunded = order.paymentTransactions.filter(t => t.status === 'refunded' || t.status === 'partially_refunded').reduce((sum, t) => sum + t.amount, 0)
    const shipping = parseAddress(order.shippingAddressJson)
    return json({
      order: {
        id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, updatedAt: order.updatedAt,
        status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, paymentMethod: order.paymentMethod,
        currency: order.currency, subtotal: order.subtotal, discountTotal: order.discountTotal, shippingTotal: order.shippingTotal, taxTotal: order.taxTotal, grandTotal: order.grandTotal,
        couponCode: order.couponCode, notes: order.notes, isGift: order.isGift, giftMessage: order.giftMessage,
        trackingNumber: order.trackingNumber, shippingMethod: order.shippingMethod, whatsappUpdates: order.whatsappUpdates,
        customer: { id: order.user?.id ?? null, name: customerName(order), email: order.email || order.user?.email || null, phone: order.phone || shipping.phone || order.user?.phone || null, hasAccount: !!order.user },
        shippingAddress: shipping,
        billingAddress: order.billingAddressJson ? parseAddress(order.billingAddressJson) : null,
        driver: order.driver,
        items: order.items.map(item => ({ id: item.id, productId: item.productId, name: item.name, variant: item.variant?.name ?? null, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice, imageUrl: item.product?.images[0]?.url ?? null })),
        events: order.events.map(event => ({ id: event.id, status: event.status, message: event.message, createdAt: event.createdAt })),
        staffNotes: order.notesHistory.map(note => ({ id: note.id, body: note.body, author: note.user?.name ?? 'Staff', createdAt: note.createdAt })),
        payments: order.paymentTransactions,
        paymentProofs: order.paymentProofs.map(proof => ({ ...proof, path: `/api/admin/orders/${order.id}/payment-proof/${proof.id}` })),
        fulfillments,
      },
      actions: {
        canManage,
        canRefund: hasPermission(user, 'orders.refund'),
        nextStatuses: canManage ? nextStatuses(order.status) : [],
        canMarkPaid: canManage && (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED'),
        canReturn: hasPermission(user, 'returns.manage') && ['SHIPPED', 'DELIVERED'].includes(order.status),
        refundable: ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) && order.status !== 'CANCELLED' ? Math.max(0, order.grandTotal - refunded) : 0,
        refundPending: order.paymentTransactions.some(t => t.status === 'refund_pending'),
        canAssignDriver: canManage && ['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(order.status),
      },
      whatsapp: {
        link: whatsappLink,
        problem: whatsappLink ? null : whatsappPhoneProblem(order, store.country) || null,
        outcomes: Object.entries(WHATSAPP_OUTCOMES).map(([id, label]) => ({ id, label })),
      },
    }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load the order', 400, noStore) }
}
