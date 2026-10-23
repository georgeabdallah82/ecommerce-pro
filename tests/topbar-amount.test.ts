import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { syncFreeDeliveryAmount } from '@/lib/topbar-amount'

describe('top bar free-delivery amount', () => {
  it('shows the store\'s real amount in place of the typed one', () => {
    assert.equal(syncFreeDeliveryAmount('Free delivery on orders over $50 · Cash on delivery', '$100'), 'Free delivery on orders over $100 · Cash on delivery')
    assert.equal(syncFreeDeliveryAmount('Free Delivery for orders above 49$ - Cash On Delivery', '$100'), 'Free Delivery for orders above $100 - Cash On Delivery')
    assert.equal(syncFreeDeliveryAmount('Free shipping over 50 USD', '$75'), 'Free shipping over $75')
  })
  it('does the same for the Arabic top bar', () => {
    assert.equal(syncFreeDeliveryAmount('\u062a\u0648\u0635\u064a\u0644 \u0645\u062c\u0627\u0646\u064a \u0644\u0644\u0637\u0644\u0628\u0627\u062a \u0641\u0648\u0642 $50 \u00b7 \u0627\u0644\u062f\u0641\u0639 \u0639\u0646\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645', '$100'), '\u062a\u0648\u0635\u064a\u0644 \u0645\u062c\u0627\u0646\u064a \u0644\u0644\u0637\u0644\u0628\u0627\u062a \u0641\u0648\u0642 $100 \u00b7 \u0627\u0644\u062f\u0641\u0639 \u0639\u0646\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645')
    assert.equal(syncFreeDeliveryAmount('\u062a\u062e\u0641\u064a\u0636\u0627\u062a \u0627\u0644\u0635\u064a\u0641: \u0643\u0644 \u0634\u064a\u0621 $10', '$100'), '\u062a\u062e\u0641\u064a\u0636\u0627\u062a \u0627\u0644\u0635\u064a\u0641: \u0643\u0644 \u0634\u064a\u0621 $10', 'a sale message that is not about free delivery is left alone')
  })
  it('leaves messages alone when unsure', () => {
    assert.equal(syncFreeDeliveryAmount('Free delivery over $50, or $5 off your first order', '$100'), 'Free delivery over $50, or $5 off your first order')
    assert.equal(syncFreeDeliveryAmount('Summer sale: everything $10', '$100'), 'Summer sale: everything $10')
    assert.equal(syncFreeDeliveryAmount('Free delivery all over Lebanon', '$100'), 'Free delivery all over Lebanon')
    assert.equal(syncFreeDeliveryAmount('Free delivery over $50', ''), 'Free delivery over $50')
  })
})
