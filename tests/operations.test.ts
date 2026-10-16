import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cashToHandOver, driverLink, driverWelcomeMessage, problemLabel } from '@/lib/drivers-shared'
import { daysLeftText, groupBySupplier, reorderList, stockKey, supplierOrderMessage, type ReorderStock } from '@/lib/reorder'
import { expensesInRange, readExpenseDate, type Expense } from '@/lib/expenses'
import { change, isMonday, weekLabel, weekRanges, weeklyFacts, type WeekOrder } from '@/lib/weekly-report'

describe('drivers', () => {
  it('adds up only the cash not handed over yet', () => {
    const cash = cashToHandOver([
      { cashCollected: 4010, cashSettledAt: null, currency: 'USD' },
      { cashCollected: 2500, cashSettledAt: '2026-10-16T10:00:00Z', currency: 'USD' },
      { cashCollected: null, cashSettledAt: null, currency: 'USD' },
      { cashCollected: 990, cashSettledAt: null, currency: 'USD' },
    ])
    assert.deepEqual(cash, { orders: 2, amount: 5000 })
  })
  it('writes the link and the first message', () => {
    assert.equal(driverLink('https://yallahaul.com/', 'abc'), 'https://yallahaul.com/driver/abc')
    const msg = driverWelcomeMessage({ storeName: 'Yalla Haul', name: 'Ali Hassan', link: 'https://yallahaul.com/driver/abc' })
    assert.match(msg, /^Hi Ali! This is your delivery list for Yalla Haul\./)
    assert.match(msg, /https:\/\/yallahaul\.com\/driver\/abc/)
    assert.equal(problemLabel('refused'), 'Customer refused the parcel')
    assert.equal(problemLabel('???'), 'Other problem')
  })
})

describe('what to reorder', () => {
  const item = (key: string, available: number, extra: Partial<ReorderStock> = {}): ReorderStock => ({ key: stockKey(key, null), productId: key, name: key, variant: '', sku: key.toUpperCase(), supplier: '', cost: 200, available, threshold: 5, ...extra })
  it('lists what needs buying, sold out first, then what runs out soonest', () => {
    const rows = reorderList(
      [item('soap', 30), item('towel', 0), item('cup', 100), item('mug', 3), item('plate', 40)],
      [{ productId: 'soap', variantId: null, quantity: 60 }, { productId: 'plate', variantId: null, quantity: 6 }, { productId: 'towel', variantId: null, quantity: 9 }],
      { coverDays: 30 },
    )
    assert.deepEqual(rows.map(r => r.productId), ['towel', 'soap', 'mug'], 'cup neither sells nor is low; plate has 200 days of stock')
    const soap = rows.find(r => r.productId === 'soap')!
    assert.equal(soap.perDay, 2)
    assert.equal(soap.daysLeft, 15)
    assert.equal(soap.suggested, 30, '2 a day for 30 days = 60, minus the 30 in stock')
    assert.equal(rows.find(r => r.productId === 'mug')!.suggested, 3, 'low with no sales: back above the low-stock level')
    assert.equal(daysLeftText(rows[0]), 'Sold out')
    assert.equal(daysLeftText(soap), 'About 15 days left')
    assert.equal(daysLeftText(rows.find(r => r.productId === 'mug')!), 'Low stock, no recent sales')
  })
  it('groups by supplier and writes the order message', () => {
    const rows = reorderList([item('a', 0, { supplier: 'Khoury Trading' }), item('b', 1, { supplier: '' })], [], { coverDays: 30 })
    assert.deepEqual(groupBySupplier(rows).map(g => g.supplier), ['Khoury Trading', 'No supplier'])
    assert.equal(supplierOrderMessage('Yalla Haul', [{ name: 'Soap', variant: 'Lavender', sku: 'SP-1', quantity: 12 }, { name: 'Skip', variant: '', sku: '', quantity: 0 }]),
      'Hello, this is Yalla Haul. I would like to order:\n\n- 12 x Soap (Lavender) [SP-1]\n\nThank you!')
  })
})

describe('running costs', () => {
  const rent: Expense = { id: 'r', name: 'Rent', amount: 30000, currency: 'USD', monthly: true, startsOn: '2026-09-01', endsOn: null }
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  it('counts a monthly cost in full for whole months, and the share of part of a month', () => {
    assert.equal(expensesInRange([rent], d('2026-09-01'), d('2026-11-01'), 'USD').total, 60000)
    assert.equal(expensesInRange([rent], d('2026-09-01'), d('2026-09-11'), 'USD').total, 10000, '10 of 30 days')
    assert.equal(expensesInRange([rent], d('2026-08-01'), d('2026-09-01'), 'USD').total, 0, 'before it started')
  })
  it('stops after its end day, and counts one-time costs on their day only', () => {
    const stopped = { ...rent, endsOn: '2026-09-15' }
    assert.equal(expensesInRange([stopped], d('2026-09-01'), d('2026-11-01'), 'USD').total, 15000)
    const once: Expense = { id: 'o', name: 'Shelves', amount: 12000, currency: 'USD', monthly: false, startsOn: '2026-10-03', endsOn: null }
    assert.equal(expensesInRange([once], d('2026-10-01'), d('2026-10-08'), 'USD').total, 12000)
    assert.equal(expensesInRange([once], d('2026-10-04'), d('2026-10-08'), 'USD').total, 0)
    assert.equal(expensesInRange([{ ...once, currency: 'LBP' }], d('2026-10-01'), d('2026-10-08'), 'USD').total, 0, 'other currencies are not mixed in')
  })
  it('reads dates typed as a day or a month', () => {
    assert.equal(readExpenseDate('2026-10')?.toISOString().slice(0, 10), '2026-10-01')
    assert.equal(readExpenseDate('2026-02-28')?.toISOString().slice(0, 10), '2026-02-28')
    assert.equal(readExpenseDate('2026-02-31'), null)
    assert.equal(readExpenseDate('soon'), null)
  })
})

describe('weekly report', () => {
  it('knows Monday and last week', () => {
    assert.equal(isMonday('2026-10-19'), true)
    assert.equal(isMonday('2026-10-20'), false)
    assert.deepEqual(weekRanges('2026-10-19'), { week: { from: '2026-10-12', to: '2026-10-18' }, previous: { from: '2026-10-05', to: '2026-10-11' } })
    assert.equal(weekLabel('2026-10-12', '2026-10-18'), '12 Oct to 18 Oct')
  })
  it('adds up the week against the week before', () => {
    const o = (dayKey: string, status: string, total: number, phone: string, area = 'Beirut', items = [{ name: 'Soap', quantity: 2, unitPrice: 500 }]): WeekOrder => ({ dayKey, status, grandTotal: total, phone, area, items })
    const orders = [
      o('2026-10-12', 'DELIVERED', 3000, '70 111 222', 'Beirut', [{ name: 'Soap', quantity: 2, unitPrice: 500 }, { name: 'Gift', quantity: 1, unitPrice: 0 }]),
      o('2026-10-14', 'SHIPPED', 5000, '71 333 444', 'Jounieh', [{ name: 'Towel', quantity: 1, unitPrice: 5000 }]),
      o('2026-10-18', 'CANCELLED', 9000, '76 555 666'),
      o('2026-10-08', 'DELIVERED', 4000, '70 111 222'),
      o('2026-10-19', 'PENDING', 7000, '03 123 456'),
    ]
    const facts = weeklyFacts(orders, '2026-10-19', new Set(['96170111222']), 'Lebanon')
    assert.equal(facts.orders, 2)
    assert.equal(facts.sales, 8000)
    assert.equal(facts.average, 4000)
    assert.equal(facts.delivered, 1)
    assert.equal(facts.cancelled, 1)
    assert.equal(facts.previousOrders, 1)
    assert.equal(facts.returningCustomers, 1)
    assert.equal(facts.newCustomers, 1)
    assert.deepEqual(facts.topProducts, [{ name: 'Soap', units: 2 }, { name: 'Towel', units: 1 }], 'free gifts are not counted')
    assert.deepEqual(facts.topAreas, [{ area: 'Beirut', orders: 1 }, { area: 'Jounieh', orders: 1 }])
    assert.equal(change(8000, 4000), '+100%')
    assert.equal(change(3000, 4000), '-25%')
    assert.equal(change(5, 0), 'new')
  })
})
