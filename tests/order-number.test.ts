import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { newOrderNumber } from '@/lib/order-number'

describe('newOrderNumber', () => {
  it('is ORD-<time>-<4 readable characters> with no stray punctuation', () => {
    for (let i = 0; i < 200; i++) assert.match(newOrderNumber(), /^ORD-[0-9A-Z]+-[A-HJ-NP-Z2-9]{4}$/)
    assert.ok(newOrderNumber(1790961558709).startsWith('ORD-MUR89QYD-'))
  })
})
