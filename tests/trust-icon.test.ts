import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { categoryInitial, trustIconKind } from '@/lib/trust-icon'

describe('trust strip icons', () => {
  it('picks a picture that matches what the owner wrote', () => {
    assert.equal(trustIconKind('Cash on delivery', 'Pay when your order arrives'), 'cash')
    assert.equal(trustIconKind('Easy returns', 'See our refund policy'), 'return')
    assert.equal(trustIconKind('WhatsApp support', 'Questions? Message us'), 'chat')
    assert.equal(trustIconKind('Delivery all over Lebanon', 'Fast and tracked'), 'truck')
    assert.equal(trustIconKind('Secure checkout', 'Your order is protected'), 'shield')
  })
  it('understands Arabic words too', () => {
    assert.equal(trustIconKind('الدفع عند الاستلام'), 'cash')
    assert.equal(trustIconKind('توصيل سريع'), 'truck')
  })
  it('falls back to a tick, and never throws on empty text', () => {
    assert.equal(trustIconKind('Hand picked'), 'check')
    assert.equal(trustIconKind(undefined, null), 'check')
    assert.equal(trustIconKind(), 'check')
  })
})

describe('category circle letter', () => {
  it('uses the first letter or digit, in capitals', () => {
    assert.equal(categoryInitial('home essentials'), 'H')
    assert.equal(categoryInitial('  3D prints'), '3')
    assert.equal(categoryInitial('مطبخ'), 'م')
  })
  it('skips symbols and returns nothing when there is no letter', () => {
    assert.equal(categoryInitial('--- Sale'), 'S')
    assert.equal(categoryInitial('***'), '')
    assert.equal(categoryInitial(null), '')
  })
})
