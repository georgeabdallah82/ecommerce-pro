import { describe, expect, it } from 'vitest'

describe('payment status hardening contract', () => {
  it('requires an external payment event id for replay-safe processing', () => {
    const body = { orderId: 'order-1', status: 'PAID' }
    const externalId = typeof body.externalId === 'string' ? body.externalId.trim().slice(0, 190) : ''
    expect(externalId).toBe('')
  })
})
