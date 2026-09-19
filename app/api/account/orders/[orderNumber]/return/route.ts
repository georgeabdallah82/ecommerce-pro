import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { alreadyReturnedQuantities, normalizeReturnItems, type ReturnableOrder } from '@/lib/returns'
import { json } from '@/lib/utils'

const RETURN_MESSAGES = new Set([
  'Order not found',
  'Only shipped or delivered orders can be returned',
  'At least one return item is required',
])

function returnFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return { status: 401, error: 'Unauthorized' }
  if (RETURN_MESSAGES.has(message)) return { status: message === 'Order not found' ? 404 : 400, error: message }
  if (message.startsWith('Invalid return quantity for ') || message.startsWith('Return quantity for ') || message.startsWith('Order item ')) return { status: 400, error: message }
  console.error('[account/orders/return] unexpected failure', error)
  return { status: 500, error: 'Unable to submit your return request right now' }
}

// Customer self-service counterpart to the admin-only POST /api/admin/returns wizard. That
// route creates a return that's already RECEIVED (staff processed it directly); this one only
// ever creates a REQUESTED return -- no restock, no refund -- for staff to approve/reject and
// then receive through the admin returns page.
export async function POST(req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const user = await requireUser()
    const { orderNumber } = await params
    const body = await req.json().catch(() => ({}))
    const reason = String(body.reason || '').trim().slice(0, 1000)
    const inputItems = Array.isArray(body.items) ? body.items.slice(0, 100) : []
    if (!reason) return json({ error: 'Please tell us why you want to return these items' }, { status: 400 })

    const returnRequest = await db.$transaction(async tx => {
      const orderRow = await tx.order.findFirst({ where: { orderNumber, userId: user.id }, include: { items: true, paymentTransactions: true } })
      if (!orderRow) throw new Error('Order not found')
      if (!['SHIPPED', 'DELIVERED'].includes(orderRow.status)) throw new Error('Only shipped or delivered orders can be returned')

      const order = orderRow as unknown as ReturnableOrder
      const alreadyReturned = await alreadyReturnedQuantities(tx, order.id, order.orderNumber)
      const normalized = normalizeReturnItems(order, inputItems, alreadyReturned)

      return tx.returnRequest.create({
        data: {
          orderId: order.id,
          customerId: user.id,
          status: 'REQUESTED',
          reason,
          notes: null,
          refundAmount: 0,
          restock: true,
          items: { create: normalized.map(x => ({ orderItemId: x.orderItemId, productId: x.item.productId, variantId: x.item.variantId, quantity: x.quantity })) },
        },
        include: { items: true },
      })
    })

    return json({ returnRequest }, { status: 201 })
  } catch (e) {
    const failure = returnFailure(e)
    return json({ error: failure.error }, { status: failure.status })
  }
}

// Lets a customer withdraw their own return request before staff has acted on it.
export async function DELETE(req: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const user = await requireUser()
    const { orderNumber } = await params
    const id = String(new URL(req.url).searchParams.get('id') || '')
    if (!id) return json({ error: 'Return id is required' }, { status: 400 })

    const order = await db.order.findFirst({ where: { orderNumber, userId: user.id }, select: { id: true } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })
    const existing = await db.returnRequest.findUnique({ where: { id } })
    if (!existing || existing.orderId !== order.id || existing.customerId !== user.id) return json({ error: 'Return request not found' }, { status: 404 })
    if (existing.status !== 'REQUESTED') return json({ error: 'This return has already been reviewed and can no longer be cancelled' }, { status: 409 })

    const updated = await db.returnRequest.update({ where: { id }, data: { status: 'CANCELLED' } })
    return json({ returnRequest: updated })
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[account/orders/return] cancel failed', e)
    return json({ error: 'Unable to cancel this return request right now' }, { status: 500 })
  }
}
