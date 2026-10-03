import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withCardStock } from '@/lib/card-stock'

describe('lib/card-stock withCardStock', () => {
  it('marks options and products sold out from their own stock rows', () => {
    const [p] = withCardStock([{ id: 'p', trackInventory: true, inventory: [{ variantId: 'a', quantity: 3, reserved: 1 }, { variantId: 'b', quantity: 2, reserved: 2 }], variants: [{ id: 'a' }, { id: 'b' }] }])
    assert.deepEqual(p.variants.map(v => v.available), [2, 0])
    assert.equal(p.soldOut, false)
    assert.equal('inventory' in p, false)
  })
  it('uses the shared pool for options without their own rows, and a product with no stock is sold out', () => {
    const [shared] = withCardStock([{ id: 'p', inventory: [{ variantId: null, quantity: 0, reserved: 0 }], variants: [{ id: 'a' }] }])
    assert.equal(shared.soldOut, true)
    const [plain] = withCardStock([{ id: 'q', inventory: [], variants: [] }])
    assert.equal(plain.soldOut, true)
  })
  it('never limits products that do not track stock or keep selling', () => {
    const [a] = withCardStock([{ id: 'p', trackInventory: false, inventory: [], variants: [{ id: 'a' }] }])
    const [b] = withCardStock([{ id: 'q', continueSellingWhenOutOfStock: true, inventory: [], variants: [] }])
    assert.equal(a.soldOut, false); assert.equal(a.variants[0].available, null); assert.equal(b.soldOut, false)
  })
})
