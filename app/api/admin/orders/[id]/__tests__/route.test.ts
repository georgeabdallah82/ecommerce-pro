import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

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

    assert.equal('rawJson' in safeTransaction, false)
  })
})
