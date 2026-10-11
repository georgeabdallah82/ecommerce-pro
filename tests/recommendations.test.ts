import test from 'node:test'
import assert from 'node:assert/strict'
import { fillSuggestions, rankBoughtTogether } from '../lib/recommendations'

test('products bought in the most orders together come first', () => {
  const rows = [
    { orderId: 'o3', productId: 'wipes' },
    { orderId: 'o3', productId: 'tissues' },
    { orderId: 'o2', productId: 'wipes' },
    { orderId: 'o2', productId: 'soap' },
    { orderId: 'o1', productId: 'soap' },
    { orderId: 'o1', productId: 'wipes' },
    { orderId: 'o1', productId: 'wipes' },
  ]
  // wipes: 3 orders, soap: 2, tissues: 1 (two lines of wipes in one order count once).
  assert.deepEqual(rankBoughtTogether(rows, new Set()), ['wipes', 'soap', 'tissues'])
  assert.deepEqual(rankBoughtTogether(rows, new Set(['wipes'])), ['soap', 'tissues'], 'the products being viewed are left out')
})

test('ties keep the product seen in the newest order first', () => {
  const rows = [{ orderId: 'new', productId: 'b' }, { orderId: 'old', productId: 'a' }]
  assert.deepEqual(rankBoughtTogether(rows, new Set()), ['b', 'a'])
})

test('too few orders: filled from the same collections and popular products, without repeats', () => {
  assert.deepEqual(fillSuggestions(['a'], ['b', 'a', 'c', 'd'], 3), ['a', 'b', 'c'])
  assert.deepEqual(fillSuggestions([], ['x', 'y'], 4), ['x', 'y'])
  assert.deepEqual(fillSuggestions(['a', 'b', 'c'], ['d'], 2), ['a', 'b'])
})
