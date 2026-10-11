import test from 'node:test'
import assert from 'node:assert/strict'
import { backInStockKey, canBuyAgain, normalizeEmail } from '../lib/back-in-stock'

const row = (variantId: string | null, quantity: number, reserved = 0) => ({ variantId, quantity, reserved })
const product = (inventory: ReturnType<typeof row>[], variants: Array<{ id: string; name: string }> = [], extra = {}) => ({ trackInventory: true, continueSellingWhenOutOfStock: false, inventory, variants, ...extra })

test('a sold-out product is buyable again once it has stock that is not reserved', () => {
  assert.equal(canBuyAgain(product([row(null, 0)]), null), false)
  assert.equal(canBuyAgain(product([row(null, 2, 2)]), null), false, 'reserved by open orders')
  assert.equal(canBuyAgain(product([row(null, 3, 2)]), null), true)
  assert.equal(canBuyAgain(product([row(null, 0)], [], { continueSellingWhenOutOfStock: true }), null), true)
  assert.equal(canBuyAgain(product([row(null, 0)], [], { trackInventory: false }), null), true)
})

test('a request for one option waits for that option, not the others', () => {
  const sizes = [{ id: 's', name: 'Small' }, { id: 'l', name: 'Large' }]
  const p = product([row('s', 4), row('l', 0)], sizes)
  assert.equal(canBuyAgain(p, 'l'), false, 'Small in stock does not mean Large is back')
  assert.equal(canBuyAgain(p, 's'), true)
  assert.equal(canBuyAgain(product([row('s', 0), row('l', 1)], sizes), 'l'), true)
  // Options sharing the product's stock.
  assert.equal(canBuyAgain(product([row(null, 5)], sizes), 'l'), true)
  // An option deleted since: any stock of the product counts.
  assert.equal(canBuyAgain(product([row('s', 2)], [{ id: 's', name: 'Small' }]), 'gone'), true)
})

test('email addresses are cleaned and checked', () => {
  assert.equal(normalizeEmail('  Maya@Example.COM '), 'maya@example.com')
  assert.equal(normalizeEmail('maya@example'), null)
  assert.equal(normalizeEmail('not an email'), null)
  assert.equal(normalizeEmail('a<b>@x.com'), null)
  assert.equal(normalizeEmail(`${'a'.repeat(250)}@x.com`), null)
  assert.equal(normalizeEmail(undefined), null)
})

test('one request per product, option and browser or email', () => {
  assert.equal(backInStockKey('p1', null, { email: 'a@b.co' }), 'p1:-:email:a@b.co')
  assert.equal(backInStockKey('p1', 'v2', { endpoint: 'https://fcm.googleapis.com/x' }), 'p1:v2:push:https://fcm.googleapis.com/x')
  assert.notEqual(backInStockKey('p1', 'v1', { email: 'a@b.co' }), backInStockKey('p1', 'v2', { email: 'a@b.co' }))
})
