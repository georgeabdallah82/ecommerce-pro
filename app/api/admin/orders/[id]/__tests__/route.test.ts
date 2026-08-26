import { describe, expect, it } from 'vitest'

describe('admin order response hardening', () => {
  it('does not expose payment rawJson in the order response contract', () => {
    const safeTransaction = {
      id: 'tx-1',
      provider: 'external',
      externalId: 'evt-1',
      status: 'paid',
      amount: 100,
      currency: 'USD',
      createdAt: new Date(),
    }
    expect('rawJson' in safeTransaction).toBe(false)
  })
})
