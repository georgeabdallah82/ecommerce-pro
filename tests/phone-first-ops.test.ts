import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orderPhoneMatches } from '@/lib/order-access'
import { cartLines, displayPhone, unfinishedCheckoutMessage, whatsappChatLink } from '@/lib/checkout-followup'
import { customerUpdateLink, customerUpdateMessage, updateForStatus } from '@/lib/order-updates'
import { summarizePhoneHistory } from '@/lib/customer-history'
import { driverRunMessage, groupByArea, orderArea, toCollect } from '@/lib/delivery-sheet'
import { dailySummaryMessage } from '@/lib/daily-summary'

const usd = (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`
const address = (extra: Record<string, string> = {}) => JSON.stringify({ firstName: 'Maya', lastName: 'Khoury', line1: 'Main street', city: 'Achrafieh', region: 'Beirut', phone: '70 123 456', ...extra })
const order = (extra: Record<string, unknown> = {}) => ({ id: 'o1', orderNumber: '1001', status: 'CONFIRMED', paymentStatus: 'UNPAID', paymentMethod: 'COD', phone: '70 123 456', grandTotal: 10200, currency: 'USD', shippingAddressJson: address(), items: [{ name: 'Tissue box', quantity: 2 }], ...extra })

describe('track your order by phone', () => {
  it('matches the order phone however it is written', () => {
    for (const typed of ['70 123 456', '70123456', '+961 70 123 456', '0096170123456', '961-70-123456']) assert.equal(orderPhoneMatches({ phone: '70 123 456' }, typed, 'Lebanon'), true, typed)
    assert.equal(orderPhoneMatches({ phone: '03 123 456' }, '+961 3 123456', 'Lebanon'), true)
    assert.equal(orderPhoneMatches({ phone: null, shippingAddressJson: address() }, '70123456', 'Lebanon'), true, 'phone only in the address')
  })
  it('refuses a different or incomplete number', () => {
    assert.equal(orderPhoneMatches({ phone: '70 123 456' }, '71 123 456', 'Lebanon'), false)
    assert.equal(orderPhoneMatches({ phone: '70 123 456' }, '123456', 'Lebanon'), false)
    assert.equal(orderPhoneMatches({ phone: '' }, '', 'Lebanon'), false)
  })
})

describe('unfinished checkouts', () => {
  const cartJson = JSON.stringify([{ name: 'Tissue box', quantity: 2, unitPrice: 450 }, { name: 'Soap', quantity: 1, unitPrice: 300 }])
  it('reads the saved cart', () => {
    assert.deepEqual(cartLines(cartJson), [{ name: 'Tissue box', quantity: 2, unitPrice: 450 }, { name: 'Soap', quantity: 1, unitPrice: 300 }])
    assert.deepEqual(cartLines('broken'), [])
  })
  it('the WhatsApp reminder greets, lists the cart and links back to checkout', () => {
    const text = unfinishedCheckoutMessage({ storeName: 'Yalla Haul', name: 'Maya Khoury', cartJson, subtotal: 1200, currency: 'USD', recoveryUrl: 'https://yallahaul.com/checkout?recover=abc' }, usd)
    assert.match(text, /^Hi Maya, this is Yalla Haul\. We noticed you didn't finish your order:/)
    assert.ok(text.includes('• 2 × Tissue box') && text.includes('Total: USD 12.00 (+ delivery)'))
    assert.ok(text.includes('https://yallahaul.com/checkout?recover=abc'))
    assert.equal(whatsappChatLink('96170123456', 'hi'), 'https://wa.me/96170123456?text=hi')
    assert.equal(whatsappChatLink('', 'hi'), '')
  })
  it('shows saved numbers the Lebanese way', () => {
    assert.equal(displayPhone('96170123456'), '+961 70 123 456')
    assert.equal(displayPhone('9613123456'), '+961 3 123 456')
    assert.equal(displayPhone('447700900123'), '+447700900123')
  })
})

describe('WhatsApp updates to the customer', () => {
  it('offers the right update for each step', () => {
    assert.equal(updateForStatus('PENDING'), null)
    assert.equal(updateForStatus('CONFIRMED'), 'confirmed')
    assert.equal(updateForStatus('PROCESSING'), 'confirmed')
    assert.equal(updateForStatus('SHIPPED'), 'on_the_way')
    assert.equal(updateForStatus('DELIVERED'), null)
  })
  it('says what to pay and links to the order', () => {
    const confirmed = customerUpdateMessage('confirmed', order(), 'Yalla Haul', usd, 'https://yallahaul.com/account/orders/1001?t=x')
    assert.match(confirmed, /^Hi Maya, your order #1001 from Yalla Haul is confirmed/)
    assert.ok(confirmed.includes('Total: USD 102.00 (cash on delivery)') && confirmed.includes('Follow your order: https://yallahaul.com/account/orders/1001?t=x'))
    const onTheWay = customerUpdateMessage('on_the_way', order({ status: 'SHIPPED' }), 'Yalla Haul', usd, '')
    assert.ok(onTheWay.includes('is on its way! The driver will call you on 70 123 456.') && onTheWay.includes('Please have USD 102.00 ready in cash.'))
    assert.ok(customerUpdateMessage('on_the_way', order({ paymentStatus: 'PAID', paymentMethod: 'CARD' }), 'Yalla Haul', usd, '').includes('nothing to pay on delivery'))
    assert.match(customerUpdateLink('confirmed', order(), 'Yalla Haul', 'Lebanon', usd, ''), /^https:\/\/wa\.me\/96170123456\?text=/)
    assert.equal(customerUpdateLink('confirmed', order({ phone: '', shippingAddressJson: '{}' }), 'Yalla Haul', 'Lebanon', usd, ''), '')
  })
})

describe('customer history by phone', () => {
  const past = (status: string, refused = false) => ({ id: status + refused, orderNumber: '9', status, grandTotal: 1000, currency: 'USD', createdAt: '2026-10-01T10:00:00Z', refused })
  it('counts delivered, cancelled and open orders', () => {
    const h = summarizePhoneHistory([past('DELIVERED'), past('DELIVERED'), past('SHIPPED')])
    assert.deepEqual([h.total, h.delivered, h.cancelled, h.open, h.warning], [3, 2, 0, 1, ''])
  })
  it('warns about refused deliveries and repeat cancellations', () => {
    assert.match(summarizePhoneHistory([past('CANCELLED', true), past('DELIVERED')]).warning, /cancelled after being sent out/)
    assert.match(summarizePhoneHistory([past('CANCELLED')]).warning, /cancelled 1 earlier order and has no delivered order yet/)
    assert.match(summarizePhoneHistory([past('CANCELLED'), past('CANCELLED'), past('DELIVERED')]).warning, /cancelled 2 earlier orders\./)
    assert.equal(summarizePhoneHistory([past('CANCELLED'), past('DELIVERED')]).warning, '', 'one cancellation from a good customer is fine')
    assert.equal(summarizePhoneHistory([]).total, 0)
  })
})

describe('delivery sheet', () => {
  it('only cash-on-delivery orders not yet paid have cash to collect', () => {
    assert.equal(toCollect(order()), 10200)
    assert.equal(toCollect(order({ paymentStatus: 'PAID' })), 0)
    assert.equal(toCollect(order({ paymentMethod: 'CARD' })), 0)
  })
  it('groups by area in the store order, others after, no area last', () => {
    const list = [
      order({ id: 'a', shippingAddressJson: address({ region: 'Metn' }) }),
      order({ id: 'b', shippingAddressJson: '{}' }),
      order({ id: 'c', shippingAddressJson: address({ region: 'Zahle' }) }),
      order({ id: 'd', shippingAddressJson: address() }),
      order({ id: 'e', shippingAddressJson: address({ region: 'Metn' }) }),
    ]
    assert.deepEqual(groupByArea(list, ['Beirut', 'Metn']).map(g => [g.area, g.orders.map(o => o.id).join('')]), [['Beirut', 'd'], ['Metn', 'ae'], ['Zahle', 'c'], ['No area', 'b']])
    assert.equal(orderArea({ shippingAddressJson: address({ region: '' }) }), 'Achrafieh', 'falls back to the town')
  })
  it('one message for the driver with every stop and the total cash', () => {
    const text = driverRunMessage([order(), order({ orderNumber: '1002', paymentStatus: 'PAID' })], 'Yalla Haul', 'Fri 16 Oct', usd)
    assert.match(text, /^Yalla Haul · Deliveries for Fri 16 Oct \(2\)/)
    assert.ok(text.includes('1) #1001 · Maya Khoury · 70 123 456') && text.includes('Collect: USD 102.00 cash'))
    assert.ok(text.includes('2) #1002') && text.includes('Paid: collect nothing'))
    assert.ok(text.trim().endsWith('Total to collect: USD 102.00'))
  })
})

describe('morning summary', () => {
  it('mentions unfinished checkouts to follow up', () => {
    const m = dailySummaryMessage({ storeName: 'Yalla Haul', dayLabel: 'x', currency: 'USD', ordersYesterday: 0, salesYesterday: 0, toConfirm: 0, toPrepare: 0, outForDelivery: 0, lowStock: [], pendingReviews: 0, reviewEmailsSent: 0, unfinished: 2 }, usd)
    assert.equal(m.push.body, '2 unfinished checkouts to follow up')
  })
})
