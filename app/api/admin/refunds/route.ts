import { db } from '@/lib/prisma'
import { requirePermission, assertRecentSignIn } from '@/lib/auth'
import { getPaymentProvider } from '@/lib/payments'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { restoreCoinsForRefund } from '@/lib/returns'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { Prisma } from '@prisma/client'
import { runInBackground } from '@/lib/background'
import { UserError, userError } from '@/lib/user-error'

const REFUND_CONFLICT_MESSAGE = 'This order was just modified — please retry.'

function refundFailure(error: unknown): { message: string; status: number; code?: string } {
  // Written for the person (lib/user-error.ts), including REAUTH_REQUIRED for a refund.
  if (error instanceof UserError) return { message: error.message, status: error.status ?? 400, code: error.code }
  // Nothing was kept: the store could not run this refund as one transaction (lib/prisma.ts).
  if (error instanceof Error && error.name === 'TransactionUnavailableError') return { message: error.message, status: 503 }
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return { message: 'Unauthorized', status: 401 }
  if (error instanceof Error && error.message === 'FORBIDDEN') return { message: 'Forbidden', status: 403 }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return { message: REFUND_CONFLICT_MESSAGE, status: 409 }
  console.error('[admin/refunds] unexpected failure', error)
  return { message: 'Unable to process the refund right now.', status: 500 }
}

type PreparedRefund = { order: any; transaction: any; provider: string; externalId: string | null }
type RecordedRefund = { order: any; transaction: any; refundedTotal: number }

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.refund')
    // A refund needs a recent confirmation of the password or a 2-step code (lib/reauth.ts).
    await assertRecentSignIn(actor)
    const body = await req.json()
    const orderId = String(body.orderId || '').trim()
    const requestedAmount = Number(body.amount)
    if (!orderId || !Number.isInteger(requestedAmount) || requestedAmount <= 0) return json({ error: 'A valid orderId and positive integer refund amount are required' }, { status: 400 })
    const reason = String(body.reason || '').slice(0, 1000) || null

    // Checks the order and writes the refund row.
    const prepareRefund = async (tx: Prisma.TransactionClient): Promise<PreparedRefund> => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { paymentTransactions: true } })
      if (!order) throw userError('Order not found', 404)
      if (order.status === 'CANCELLED') throw userError('Cancelled orders cannot be refunded')
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) throw userError('Only paid orders can be refunded')

      const pendingRefunds = order.paymentTransactions.filter(t => t.status === 'refund_pending')
      if (pendingRefunds.length) throw userError('A refund is already in progress for this order')

      const refunded = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status)).reduce((sum, t) => sum + t.amount, 0)
      const remaining = Math.max(0, order.grandTotal - refunded)
      if (remaining <= 0) throw userError('Order is already fully refunded')
      if (requestedAmount > remaining) throw userError(`Refund cannot exceed the remaining refundable amount of ${remaining}`)

      // The remaining-refundable check above is only a snapshot of paymentTransaction rows.
      // Tie it to an atomic conditional write on the order itself (bounded on the updatedAt we
      // just read) so a concurrent refund/return request that read the same snapshot loses the
      // race here instead of both requests succeeding and together exceeding grandTotal.
      const guarded = await tx.order.updateMany({ where: { id: order.id, updatedAt: order.updatedAt }, data: { updatedAt: new Date() } })
      if (guarded.count !== 1) throw userError(REFUND_CONFLICT_MESSAGE, 409)

      const original = order.paymentTransactions.filter(t => t.provider !== 'manual' && ['paid', 'captured', 'authorized'].includes(t.status) && t.externalId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      const provider = order.paymentMethod === 'WALLET' ? 'wallet' : (original?.provider || 'manual')
      if (provider !== 'manual' && provider !== 'wallet' && !original?.externalId) throw userError('Paid gateway transaction is missing its external reference')

      const transaction = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider,
          externalId: original?.externalId || null,
          status: provider === 'manual' || provider === 'wallet' ? 'refunded' : 'refund_pending',
          amount: requestedAmount,
          currency: order.currency,
          rawJson: JSON.stringify({ reason, actorId: actor.id }),
        },
      })
      return { order, transaction, provider, externalId: original?.externalId || null }
    }

    // Records a refund in the store: the refund row, the wallet credit, the coin and gift-card restores, the order's totals.
    const applyRefund = async (tx: Prisma.TransactionClient, prepared: PreparedRefund): Promise<RecordedRefund> => {
      // Locks the order row, so two refunds of one order record their restores one after the other.
      await tx.order.update({ where: { id: prepared.order.id }, data: { updatedAt: new Date() } })
      const order = await tx.order.findUnique({ where: { id: prepared.order.id }, include: { paymentTransactions: true } })
      if (!order) throw userError('Order not found', 404)

      await tx.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refunded' } })
      const successfulRefunds = order.paymentTransactions.filter(t => ['refunded', 'partially_refunded'].includes(t.status) && t.id !== prepared.transaction.id).reduce((sum, t) => sum + t.amount, 0) + requestedAmount
      const paymentStatus = successfulRefunds >= order.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      const status = paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.status

      if (prepared.provider === 'wallet' && order.userId) {
        const referenceId = `wallet-refund:${prepared.transaction.id}`
        const duplicate = await tx.walletTransaction.findFirst({ where: { userId: order.userId, referenceId, type: 'REFUND' }, select: { id: true } })
        if (!duplicate) {
          await tx.walletTransaction.create({
            data: { id: `wal_refund_${prepared.transaction.id}`, userId: order.userId, amount: requestedAmount, currency: order.currency, type: 'REFUND', reason: 'Order refund credited to wallet', referenceId },
          })
        }
      }

      await restoreCoinsForRefund(tx, { order, successfulRefunds, refundId: prepared.transaction.id })

      const redeemedGift = redeemedGiftCard(order.paymentTransactions)
      if (redeemedGift) await restoreGiftCardBalance(tx, order.id, redeemedGift, successfulRefunds, order.grandTotal)

      const updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus, status, events: { create: { status, message: paymentStatus === 'REFUNDED' ? `Order fully refunded (${requestedAmount} ${order.currency}).` : `Order partially refunded (${requestedAmount} ${order.currency}).` } } } })
      await audit(actor.id, 'order.refunded', 'Order', order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider, refundedTotal: successfulRefunds })
      return { order: updated, transaction: { ...prepared.transaction, status: 'refunded' }, refundedTotal: successfulRefunds }
    }

    // The notification and the webhook go out once a refund is recorded. A failed notification never undoes it.
    const finishRefund = async (done: RecordedRefund) => {
      if (done.order.userId) {
        try {
          await db.notification.create({ data: { userId: done.order.userId, title: `Refund for ${done.order.orderNumber}`, body: `A refund of ${requestedAmount} ${done.order.currency} was processed.`, type: 'ORDER_REFUND' } })
        } catch {
          // Notifications are best-effort and must not turn a committed refund into a failure.
        }
      }
      runInBackground(dispatchWebhookEvent('order.updated', { id: done.order.id, orderNumber: done.order.orderNumber, status: done.order.status, paymentStatus: done.order.paymentStatus }).catch(error => console.error('[webhook] order.updated dispatch failed', error)))
      return json({ order: done.order, refund: done.transaction, refundedTotal: done.refundedTotal }, { status: 201 })
    }

    // Manual and wallet refunds move no money outside the store. They are prepared and recorded in one transaction,
    // so all of it is kept or none of it is. A gateway refund is only prepared here: the gateway is asked next, and the
    // refund is recorded once the gateway has refunded it.
    const first = await db.$transaction(async tx => {
      const prepared = await prepareRefund(tx)
      if (prepared.provider === 'manual' || prepared.provider === 'wallet') return { prepared, done: await applyRefund(tx, prepared) as RecordedRefund | null }
      return { prepared, done: null as RecordedRefund | null }
    }, { requireTransaction: true } as any)
    const { prepared } = first
    if (first.done) return finishRefund(first.done)

    let refundResult: 'pending' | 'refunded' | null = null
    try {
      const provider = await getPaymentProvider(prepared.provider)
      if (provider.name !== prepared.provider || !provider.refundPayment || !prepared.externalId) throw new Error(`Payment provider ${prepared.provider} is not available for refunds`)
      refundResult = await provider.refundPayment(prepared.externalId, requestedAmount, prepared.order.currency)
    } catch (error) {
      // The gateway did not refund: the refund is marked failed for an admin to retry.
      await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_failed', rawJson: JSON.stringify({ reason, actorId: actor.id, error: error instanceof Error ? error.message : 'Gateway refund failed' }).slice(0, 5000) } })
      await audit(actor.id, 'order.refund_failed', 'Order', prepared.order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider })
      throw error
    }
    if (refundResult === 'pending') {
      await db.paymentTransaction.update({ where: { id: prepared.transaction.id }, data: { status: 'refund_pending', rawJson: JSON.stringify({ reason, actorId: actor.id, gatewayStatus: 'PENDING' }) } })
      await audit(actor.id, 'order.refund_pending', 'Order', prepared.order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider })
      return json({ order: prepared.order, refund: { ...prepared.transaction, status: 'refund_pending' }, refundedTotal: null, status: 'pending' }, { status: 202 })
    }

    // The gateway has refunded the money, so the refund is recorded now. If the store cannot record it in one transaction,
    // it stays pending on the order and is not marked failed: the gateway has already refunded it.
    let done: RecordedRefund
    try {
      done = await db.$transaction(async tx => applyRefund(tx, prepared), { requireTransaction: true } as any)
    } catch (error) {
      console.error('[admin/refunds] gateway refund was accepted but not recorded', error)
      await audit(actor.id, 'order.refund_recording_failed', 'Order', prepared.order.id, { amount: requestedAmount, transactionId: prepared.transaction.id, provider: prepared.provider }).catch(() => {})
      return json({ order: prepared.order, refund: { ...prepared.transaction, status: 'refund_pending' }, refundedTotal: null, status: 'pending', message: 'The gateway accepted this refund, but the store could not record it right now. It stays pending until the gateway confirms it.' }, { status: 202 })
    }
    return finishRefund(done)
  } catch (e) {
    const failure = refundFailure(e)
    return json({ error: failure.message, ...(failure.code ? { code: failure.code } : {}) }, { status: failure.status })
  }
}
