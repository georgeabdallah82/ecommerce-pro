import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orderCustomerName, parseOrderReviews, reviewAuthorName, reviewRequestMessage } from '@/lib/order-reviews'
import { isValidOrderReviewToken, isValidOrderViewToken, orderReviewPath, orderReviewToken } from '@/lib/order-access'

process.env.AUTH_SECRET ||= 'test-secret-for-order-reviews'
const inOrder = new Set(['p1', 'p2'])

describe('"Rate your order" link', () => {
  it('only the code made for that order opens it, and it is not the order view code', () => {
    const token = orderReviewToken('1001')
    assert.equal(isValidOrderReviewToken('1001', token), true)
    assert.equal(isValidOrderReviewToken('1002', token), false, 'another order')
    assert.equal(isValidOrderReviewToken('1001', token.slice(0, -1)), false)
    assert.equal(isValidOrderReviewToken('1001', ''), false)
    assert.equal(isValidOrderViewToken('1001', token), false, 'the review link does not open the order (address, phone)')
    assert.equal(orderReviewPath('1001'), `/review/1001?t=${token}`)
  })
})

describe('reviews sent from the page', () => {
  it('keeps rated products from this order, with optional comments', () => {
    assert.deepEqual(parseOrderReviews([{ productId: 'p1', rating: 5, body: '  Great  ' }, { productId: 'p2', rating: 3 }], inOrder), {
      reviews: [{ productId: 'p1', rating: 5, body: 'Great' }, { productId: 'p2', rating: 3, body: null }],
    })
  })
  it('refuses products not in the order, the same product twice, bad ratings and long comments', () => {
    assert.ok(parseOrderReviews([{ productId: 'other', rating: 5 }], inOrder).error)
    assert.ok(parseOrderReviews([{ productId: 'p1', rating: 5 }, { productId: 'p1', rating: 4 }], inOrder).error)
    for (const rating of [0, 6, 4.5, 'five', null]) assert.ok(parseOrderReviews([{ productId: 'p1', rating }], inOrder).error, `rating ${rating}`)
    assert.ok(parseOrderReviews([{ productId: 'p1', rating: 5, body: 'x'.repeat(2001) }], inOrder).error)
    assert.equal(parseOrderReviews([], inOrder).error, 'Choose a star rating for at least one product.')
    assert.ok(parseOrderReviews('nope', inOrder).error)
  })
  it('uses the typed name, else the name on the order', () => {
    assert.equal(reviewAuthorName('  Rana   Haddad ', 'Someone Else'), 'Rana Haddad')
    assert.equal(reviewAuthorName('', 'Rana Haddad'), 'Rana Haddad')
    assert.equal(reviewAuthorName('x'.repeat(80), ''), 'x'.repeat(60))
    assert.equal(orderCustomerName(JSON.stringify({ firstName: 'Rana', lastName: 'Haddad' })), 'Rana Haddad')
    assert.equal(orderCustomerName('not json'), '')
  })
  it('the WhatsApp message greets the customer and carries the link', () => {
    const text = reviewRequestMessage({ storeName: 'Yalla Haul', firstName: 'Rana', orderNumber: '1001', link: 'https://yallahaul.com/review/1001?t=abc' })
    assert.match(text, /^Hi Rana, thank you for your order #1001 from Yalla Haul!/)
    assert.ok(text.endsWith('https://yallahaul.com/review/1001?t=abc'))
  })
})
