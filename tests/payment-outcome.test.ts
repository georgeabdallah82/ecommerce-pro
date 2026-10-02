import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { db } from '@/lib/prisma'
import { markOnlinePaymentFailed, markOnlinePaymentPaid } from '@/lib/payment-outcome'

async function cardOrder(orderNumber: string, coinsUsed: number) {
  const order = await db.order.create({ data: { orderNumber, email: 'buyer@test.dev', userId: 'usr-customer-1', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod: 'CARD', subtotal: 1000, grandTotal: 1000, currency: 'USD', shippingAddressJson: '{}', paymentTransactions: { create: [{ provider: 'checkout', status: 'created', amount: 1000, currency: 'USD', rawJson: JSON.stringify({ coinsUsed }) }] } } as any })
  const gateway = await db.paymentTransaction.create({ data: { orderId: order.id, provider: 'areeba_mpgs', status: 'pending', amount: 1000, currency: 'USD', externalId: `sess-${orderNumber}` } as any })
  return { order: { id: order.id, orderNumber }, transactionId: gateway.id }
}

describe('card payment outcome', () => {
  it('a failed payment cancels the order and gives coins back exactly once, whichever path reports it first', async () => {
    const { order, transactionId } = await cardOrder('ORD-TEST-FAIL', 250)
    assert.equal(await markOnlinePaymentFailed(order, transactionId, 'return'), true)
    assert.equal(await markOnlinePaymentFailed(order, transactionId, 'webhook'), false)
    const saved = await db.order.findUnique({ where: { id: order.id } })
    assert.equal(saved?.paymentStatus, 'FAILED')
    assert.equal(saved?.status, 'CANCELLED')
    const reversals = await db.coinTransaction.findMany({ where: { userId: 'usr-customer-1', referenceId: 'coin-reversal:ORD-TEST-FAIL:payment-failed' } })
    assert.equal(reversals.length, 1)
    assert.equal(reversals[0].amount, 250)
  })
  it('a paid notification only counts once (one confirmation email, not one per notification)', async () => {
    const { order, transactionId } = await cardOrder('ORD-TEST-PAID', 0)
    assert.equal(await markOnlinePaymentPaid(order, transactionId, 'return'), true)
    assert.equal(await markOnlinePaymentPaid(order, transactionId, 'webhook'), false)
    assert.equal((await db.order.findUnique({ where: { id: order.id } }))?.paymentStatus, 'PAID')
  })
})
