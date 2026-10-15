import test from 'node:test'
import assert from 'node:assert/strict'
import { computeProfit, detectDateOrder, normalizePlatform, parseSpendDate, readCostSetting, readSpendCsv, reportRange, type ProfitOrder } from '../lib/profit'

const order = (o: Partial<ProfitOrder>): ProfitOrder => ({
  status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'COD', currency: 'USD', grandTotal: 0, taxTotal: 0, shippingTotal: 0, discountTotal: 0, refunded: 0, items: [], ...o,
})
const cup = (qty: number, total: number) => ({ productId: 'cup', name: 'Cup', quantity: qty, totalPrice: total })
const bowl = (qty: number, total: number) => ({ productId: 'bowl', name: 'Bowl', quantity: qty, totalPrice: total })
const costs = new Map<string, number | null>([['cup', 1000], ['bowl', null]])

test('every figure is shown on its own: gross, cancelled, refunded, collected, unpaid cash on delivery', () => {
  const r = computeProfit([
    order({ grandTotal: 5300, shippingTotal: 300, items: [cup(2, 5000)] }),
    order({ status: 'CANCELLED', paymentStatus: 'UNPAID', grandTotal: 4000, items: [cup(1, 4000)] }),
    order({ status: 'SHIPPED', paymentStatus: 'UNPAID', grandTotal: 2800, shippingTotal: 300, items: [cup(1, 2500)] }),
    order({ paymentStatus: 'PARTIALLY_REFUNDED', paymentMethod: 'CARD', grandTotal: 3000, refunded: 1000, items: [cup(1, 3000)] }),
    order({ status: 'PENDING', paymentStatus: 'FAILED', paymentMethod: 'CARD', grandTotal: 2000, items: [cup(1, 2000)] }),
  ], costs, { deliveryCostPerOrder: 200, packagingCostPerOrder: 50 }, [{ platform: 'Meta', amount: 1500, currency: 'USD' }], 'USD')
  assert.equal(r.grossOrderValue, 17100)
  assert.deepEqual(r.cancelled, { orders: 1, value: 4000 })
  assert.equal(r.refunded, 1000)
  assert.equal(r.netSales, 17100 - 4000 - 1000)
  assert.deepEqual(r.collected, { orders: 2, sales: 7300, salesExTax: 7300, productCost: 3000 })
  assert.deepEqual(r.unpaidCod, { orders: 1, sales: 2800, salesExTax: 2800, productCost: 1000 })
  assert.equal(r.unpaidOther.orders, 1)
  assert.equal(r.productCost.total, 5000, 'the cancelled order costs nothing')
  assert.deepEqual(r.delivery, { perOrder: 200, orders: 4, total: 800 })
  // Collected: 7300 - cost 3000 - 2 x 250 per order - 1500 ads.
  assert.equal(r.profit.collectedSoFar, 2300)
  // Plus the open orders: (2800 - 1000 - 250) + (2000 - 1000 - 250).
  assert.equal(r.profit.ifUnpaidCollected, 2300 + 1550 + 750)
  assert.equal(r.estimated, false)
})

test('tax is not profit, and a fully refunded order has no sale and no product cost', () => {
  const r = computeProfit([
    order({ grandTotal: 11000, taxTotal: 1000, items: [cup(1, 10000)] }),
    order({ status: 'REFUNDED', paymentStatus: 'REFUNDED', grandTotal: 5000, refunded: 5000, items: [cup(3, 5000)] }),
  ], costs, { deliveryCostPerOrder: 0, packagingCostPerOrder: 0 }, [{ platform: 'Meta', amount: 1, currency: 'USD' }], 'USD')
  assert.equal(r.taxIncluded, 1000)
  assert.equal(r.collected.salesExTax, 10000)
  assert.equal(r.productCost.total, 1000)
  assert.equal(r.refunded, 5000)
  assert.equal(r.collected.orders, 1)
})

test('costs that were never entered are listed and flagged, never counted as zero', () => {
  const r = computeProfit([order({ grandTotal: 9000, items: [cup(1, 4000), bowl(2, 5000)] })], new Map([['cup', 1000], ['bowl', 0]]), { deliveryCostPerOrder: null, packagingCostPerOrder: null }, [], 'USD')
  assert.equal(r.estimated, true)
  assert.deepEqual(r.productCost.missing, [{ productId: 'bowl', name: 'Bowl', units: 2, sales: 5000 }])
  assert.equal(r.productCost.missingSales, 5000)
  assert.equal(r.delivery.total, null)
  assert.deepEqual(r.missing, ['Product cost not entered for 1 product sold', 'Delivery cost per order not entered', 'Packaging cost per order not entered', 'No ad spend entered for these dates'])
})

test('orders and ad spend in another currency are left out and counted', () => {
  const r = computeProfit([order({ grandTotal: 1000 }), order({ currency: 'LBP', grandTotal: 900000 })], costs, { deliveryCostPerOrder: null, packagingCostPerOrder: null }, [{ platform: 'Meta', amount: 500, currency: 'EUR' }], 'USD')
  assert.equal(r.grossOrderValue, 1000)
  assert.equal(r.otherCurrencyOrders, 1)
  assert.equal(r.adSpend.total, 0)
  assert.equal(r.adSpend.otherCurrency, 1)
})

test('cost settings: empty is "not entered", not zero', () => {
  assert.equal(readCostSetting(''), null)
  assert.equal(readCostSetting(null), null)
  assert.equal(readCostSetting('0'), 0)
  assert.equal(readCostSetting('250'), 250)
  assert.equal(readCostSetting('-5'), null)
})

test('the date range is whole days, end included, never past today', () => {
  const now = new Date('2026-10-15T14:00:00Z')
  const last7 = reportRange(new URLSearchParams('days=7'), now)
  assert.equal(last7.since.toISOString(), '2026-10-09T00:00:00.000Z')
  assert.equal(last7.until.toISOString(), '2026-10-16T00:00:00.000Z')
  const custom = reportRange(new URLSearchParams('start=2026-10-01&end=2026-10-31'), now)
  assert.equal(custom.until.toISOString(), '2026-10-16T00:00:00.000Z')
  assert.equal(custom.days, 15)
})

test('ad spend sheets: Meta export headers, day-first dates, totals rows and repeated days', () => {
  const file = readSpendCsv([
    'Campaign name,Reporting starts,Amount spent (USD)',
    'Summer,2026-10-01,12.50',
    'Winter,2026-10-01,7.50',
    'Summer,2026-10-02,',
    ',,20.00',
  ].join('\n'), 'Facebook')
  assert.deepEqual(file.errors, [])
  assert.deepEqual(file.rows, [{ line: 2, date: '2026-10-01', platform: 'Meta', amount: 2000 }])
  const sheet = readSpendCsv('Date,Platform,Amount\n13/10/2026,TikTok,5\n02/10/2026,tiktok ads,$3.00\nsoon,Meta,1', '')
  assert.equal(sheet.dateOrder, 'dmy')
  assert.deepEqual(sheet.rows.map(r => [r.date, r.platform, r.amount]), [['2026-10-02', 'TikTok', 300], ['2026-10-13', 'TikTok', 500]])
  assert.match(sheet.errors[0].message, /"soon" is not a date/)
  assert.match(readSpendCsv('Day,Cost\n10/13/2026,1\n13/10/2026,1', '').errors[0].message, /two different ways/)
  assert.match(readSpendCsv('When,Money\n2026-10-01,1', '').errors[0].message, /No Date column/)
  assert.match(readSpendCsv('Date,Amount\n2026-10-01,5\n,3', '').errors[0].message, /date is missing/)
})

test('dates and platforms as people write them', () => {
  assert.equal(parseSpendDate('2026-02-30'), null)
  assert.equal(parseSpendDate('5/10/2026'), '2026-10-05')
  assert.equal(parseSpendDate('10/13/2026', 'mdy'), '2026-10-13')
  assert.equal(detectDateOrder(['1/2/2026', '3/4/2026']), 'dmy')
  assert.equal(normalizePlatform('Instagram'), 'Meta')
  assert.equal(normalizePlatform('YouTube'), 'Google')
  assert.equal(normalizePlatform('  Snap  chat '), 'Snap chat')
})
