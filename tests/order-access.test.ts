import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
process.env.AUTH_SECRET ||= 'test-secret-for-order-access'
import { canViewOrder, isValidOrderViewToken, orderSuccessPath, orderViewToken } from '@/lib/order-access'

describe('order access (CR-01)', () => {
  const order = { orderNumber: 'ORD-MUTQ8AZQ-NAKZ', userId: 'user-1', email: 'Maya@Example.com' }

  it('an order number alone shows nothing', () => {
    assert.equal(canViewOrder(order, {}), false)
    assert.equal(canViewOrder(order, { token: '' }), false)
    assert.equal(canViewOrder(order, { userId: 'someone-else' }), false)
    assert.equal(canViewOrder(order, { email: 'other@example.com' }), false)
    assert.equal(canViewOrder({ ...order, userId: null }, { userId: null }), false)
  })

  it('a forged or borrowed view code is refused', () => {
    assert.equal(canViewOrder(order, { token: 'x'.repeat(32) }), false)
    assert.equal(canViewOrder(order, { token: orderViewToken('ORD-MUTQ8AZQ-OTHR') }), false) // another order's code
    assert.equal(isValidOrderViewToken(order.orderNumber, orderViewToken(order.orderNumber).slice(0, 31)), false)
  })

  it('the owner, the signed view code, or the order email gets in', () => {
    assert.equal(canViewOrder(order, { userId: 'user-1' }), true)
    assert.equal(canViewOrder(order, { token: orderViewToken(order.orderNumber) }), true)
    assert.equal(canViewOrder(order, { email: ' maya@example.com ' }), true)
  })

  it('the thank-you link carries the code and no email', () => {
    const path = orderSuccessPath(order.orderNumber, 'paid')
    const q = new URLSearchParams(path.split('?')[1])
    assert.equal(q.get('order'), order.orderNumber)
    assert.equal(q.get('payment'), 'paid')
    assert.equal(isValidOrderViewToken(order.orderNumber, q.get('t')), true)
    assert.equal(q.has('email'), false)
  })

  it('codes depend on the server secret', () => {
    const before = orderViewToken(order.orderNumber)
    const saved = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'a-different-secret'
    try { assert.notEqual(orderViewToken(order.orderNumber), before) } finally { process.env.AUTH_SECRET = saved }
  })
})
