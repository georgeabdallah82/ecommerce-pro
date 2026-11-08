import test from 'node:test'
import assert from 'node:assert/strict'
import { computeProfit, type ProfitOrder } from '../lib/profit'

// Reports must cost each sale at what the item cost when it was sold. Only sales made before the
// cost was recorded use the product's current cost.
const order = (o: Partial<ProfitOrder>): ProfitOrder => ({
  status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'COD', currency: 'USD', grandTotal: 0, taxTotal: 0, shippingTotal: 0, discountTotal: 0, refunded: 0, items: [],
  ...o,
})
const noExtras = { deliveryCostPerOrder: null, packagingCostPerOrder: null }

test('a sale is costed at the cost recorded on it, not the product\'s later cost', () => {
  const sold = order({
    grandTotal: 1000,
    items: [{ productId: 'cup', name: 'Cup', quantity: 2, totalPrice: 1000, costPrice: 300 }],
  })
  // The product now costs 900; the sale still cost 300 per unit.
  const report = computeProfit([sold], new Map([['cup', 900]]), noExtras, [], 'USD')
  assert.equal(report.byProduct[0].cost, 600)
  assert.equal(report.byProduct[0].profit, 400)
})

test('a sale with no recorded cost falls back to the product\'s current cost', () => {
  const older = order({
    grandTotal: 1000,
    items: [{ productId: 'cup', name: 'Cup', quantity: 2, totalPrice: 1000, costPrice: null }],
  })
  const report = computeProfit([older], new Map([['cup', 350]]), noExtras, [], 'USD')
  assert.equal(report.byProduct[0].cost, 700)
})

test('a sale with neither a recorded cost nor a current cost is reported as cost unknown', () => {
  const unknown = order({
    grandTotal: 1000,
    items: [{ productId: 'cup', name: 'Cup', quantity: 1, totalPrice: 1000, costPrice: null }],
  })
  const report = computeProfit([unknown], new Map(), noExtras, [], 'USD')
  assert.equal(report.byProduct[0].cost, null)
})
