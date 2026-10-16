import test from 'node:test'
import assert from 'node:assert/strict'
import { ORDER_VIEWS, customerName, driverMessage, itemsSummary, mapsLink, nextStep, paymentInfo, statusInfo, telLink, viewCount } from '../lib/order-flow'

const fmt = (cents: number, currency: string) => `${currency === 'USD' ? '$' : ''}${(cents / 100).toFixed(2)}`
const address = JSON.stringify({ firstName: 'Rana', lastName: 'Haddad', line1: 'Hamra street, bldg 4', line2: '3rd floor', city: 'Beirut', country: 'Lebanon', phone: '70 123 456' })
const order = {
  orderNumber: 'ORD-1', status: 'PENDING', paymentStatus: 'UNPAID', paymentMethod: 'COD', phone: '', email: 'rana@example.com',
  grandTotal: 10450, currency: 'USD', shippingAddressJson: address, shippingMethod: 'Standard delivery',
  items: [{ name: 'Tissue box', quantity: 2 }, { name: 'Soap', quantity: 1, variant: { name: 'Lavender' } }],
}

test('each open order has one next step, in order; closed orders have none', () => {
  const steps = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].map(status => nextStep({ ...order, status }, fmt)?.to)
  assert.deepEqual(steps, ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'])
  for (const status of ['DELIVERED', 'CANCELLED', 'REFUNDED']) assert.equal(nextStep({ ...order, status }, fmt), null, status)
  assert.equal(nextStep(order, fmt)?.label, 'Confirm order')
})

test('delivering a cash-on-delivery order says how much the driver collected', () => {
  const cod = nextStep({ ...order, status: 'SHIPPED' }, fmt)!
  assert.match(cod.label, /\$104\.50 collected/)
  assert.match(cod.confirmMessage, /marked as paid/)
  const paid = nextStep({ ...order, status: 'SHIPPED', paymentStatus: 'PAID' }, fmt)!
  assert.equal(paid.label, 'Mark as delivered')
})

test('statuses and payments read in plain words', () => {
  assert.equal(statusInfo('SHIPPED').label, 'Out for delivery')
  assert.equal(statusInfo('PENDING').hint, 'Confirm it with the customer')
  assert.equal(paymentInfo(order).label, 'Cash on delivery · not collected yet')
  assert.equal(paymentInfo({ ...order, paymentStatus: 'PAID' }).label, 'Cash on delivery · paid')
  assert.equal(paymentInfo({ ...order, paymentMethod: 'BANK_TRANSFER' }).label, 'Bank transfer · waiting for payment')
  assert.equal(paymentInfo({ ...order, status: 'CANCELLED' }).label, 'Cash on delivery · not paid')
})

test('guests are named from the delivery address; items are summarised', () => {
  assert.equal(customerName(order), 'Rana Haddad')
  assert.equal(customerName({ ...order, user: { name: 'Account Name' } }), 'Account Name')
  assert.equal(customerName({ ...order, shippingAddressJson: null }), 'rana@example.com')
  assert.equal(itemsSummary(order), 'Tissue box × 2 + 1 more')
  assert.equal(itemsSummary({ items: [] }), 'No items')
})

test('call and map links use the delivery details', () => {
  assert.equal(telLink(order, 'Lebanon'), 'tel:+96170123456')
  assert.equal(telLink({ ...order, shippingAddressJson: '{}' }, 'Lebanon'), '')
  assert.match(mapsLink(order), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Hamra%20street/)
})

test('the driver message has who, where, what and the cash to collect, and no staff notes', () => {
  const text = driverMessage({ ...order, status: 'PROCESSING' }, 'Yalla Haul', fmt)
  assert.match(text, /Delivery #ORD-1/)
  assert.match(text, /Customer: Rana Haddad/)
  assert.match(text, /Phone: 70 123 456/)
  assert.match(text, /Address: Hamra street, bldg 4, 3rd floor, Beirut, Lebanon/)
  assert.match(text, /• 1 × Soap \(Lavender\)/)
  assert.match(text, /Collect: \$104\.50 cash/)
  assert.match(driverMessage({ ...order, paymentStatus: 'PAID' }, '', fmt), /Already paid: collect nothing/)
  assert.doesNotMatch(driverMessage({ ...order, notes: 'internal: customer was rude' } as typeof order, '', fmt), /rude/)
})

test('view counts add up the statuses in each view', () => {
  const counts = { PENDING: 2, CONFIRMED: 1, PROCESSING: 3, SHIPPED: 1, DELIVERED: 5, CANCELLED: 4, REFUNDED: 1 }
  const byId = Object.fromEntries(ORDER_VIEWS.map(v => [v.id, viewCount(counts, v)]))
  assert.deepEqual(byId, { action: 2, prepare: 4, delivery: 1, done: 5, closed: 5, all: 17 })
})
