import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { redeemedGiftCard, expireGiftCards } from '@/lib/gift-cards'

describe('lib/gift-cards redeemedGiftCard', () => {
  it('reads a valid redemption off the checkout payment transaction', () => {
    const result = redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ coinDiscount: 0, giftCardId: 'gc_1', giftCardAmount: 500 }) }])
    assert.deepEqual(result, { giftCardId: 'gc_1', giftCardAmount: 500 })
  })

  it('ignores payment transactions from other providers', () => {
    const result = redeemedGiftCard([{ provider: 'areeba_mpgs', rawJson: JSON.stringify({ giftCardId: 'gc_1', giftCardAmount: 500 }) }])
    assert.equal(result, null)
  })

  it('returns null when no gift card was redeemed', () => {
    const result = redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ coinDiscount: 0, coinsUsed: 0 }) }])
    assert.equal(result, null)
  })

  it('returns null for a missing or malformed rawJson', () => {
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: null }]), null)
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: 'not json' }]), null)
    assert.equal(redeemedGiftCard([]), null)
  })

  it('rejects a non-string id or a non-positive amount', () => {
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ giftCardId: 42, giftCardAmount: 500 }) }]), null)
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ giftCardId: 'gc_1', giftCardAmount: 0 }) }]), null)
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ giftCardId: 'gc_1', giftCardAmount: -50 }) }]), null)
    assert.equal(redeemedGiftCard([{ provider: 'checkout', rawJson: JSON.stringify({ giftCardId: 'gc_1', giftCardAmount: 12.5 }) }]), null)
  })
})

function fakeDb() {
  const calls: any[] = []
  return {
    calls,
    giftCard: {
      updateMany: async (args: any) => { calls.push(args); return { count: 1 } },
    },
  }
}

describe('lib/gift-cards expireGiftCards', () => {
  it('only targets ACTIVE cards whose expiresAt has passed', async () => {
    const db = fakeDb()
    await expireGiftCards(db)
    assert.equal(db.calls.length, 1)
    const { where, data } = db.calls[0]
    assert.equal(where.status, 'ACTIVE')
    assert.ok(where.expiresAt.lt instanceof Date)
    assert.equal(data.status, 'EXPIRED')
  })
})
