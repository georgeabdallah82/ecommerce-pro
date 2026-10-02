import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { db } from '@/lib/prisma'
import { GET } from '@/app/api/internal/release-expired-reservations/route'

// Runs the real cron handler against the in-memory mock database.
async function storefrontOrder(orderNumber: string, paymentMethod: 'COD' | 'CARD' | 'BANK_TRANSFER') {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const order = await db.order.create({ data: { orderNumber, email: 'buyer@test.dev', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod, subtotal: 1000, grandTotal: 1000, currency: 'USD', shippingAddressJson: '{}', createdAt: twoHoursAgo, paymentTransactions: { create: { provider: 'checkout', status: 'created', amount: 1000, currency: 'USD' } } } as any })
  const stock = await db.inventoryItem.create({ data: { productId: 'prod-1', quantity: 5, reserved: 1 } as any })
  await db.inventoryMovement.create({ data: { inventoryId: stock.id, type: 'SALE_RESERVATION', quantity: 1, reason: 'Checkout reservation', referenceId: orderNumber } as any })
  return order.id
}

describe('release-expired-reservations cron', () => {
  it('cancels abandoned card checkouts but never cash-on-delivery or bank transfer orders', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const cod = await storefrontOrder('ORD-TEST-COD', 'COD')
    const bank = await storefrontOrder('ORD-TEST-BANK', 'BANK_TRANSFER')
    const card = await storefrontOrder('ORD-TEST-CARD', 'CARD')

    const unauthorized = await GET(new Request('http://x/api/internal/release-expired-reservations'))
    assert.equal(unauthorized.status, 401)

    const res = await GET(new Request('http://x/api/internal/release-expired-reservations', { headers: { authorization: 'Bearer test-cron-secret' } }))
    assert.equal(res.status, 200)

    assert.equal((await db.order.findUnique({ where: { id: cod } }))?.status, 'PENDING')
    assert.equal((await db.order.findUnique({ where: { id: bank } }))?.status, 'PENDING')
    assert.equal((await db.order.findUnique({ where: { id: card } }))?.status, 'CANCELLED')
  })
})
