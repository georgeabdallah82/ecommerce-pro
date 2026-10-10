import test from 'node:test'
import assert from 'node:assert/strict'
import { wwwRedirectTarget } from '../lib/www-redirect'

test('www visitors go to the same page on the plain domain', () => {
  assert.equal(
    wwwRedirectTarget('https://www.yallahaul.com/product/tissue?ref=ig#top'),
    'https://yallahaul.com/product/tissue?ref=ig#top',
  )
  assert.equal(wwwRedirectTarget('https://www.yallahaul.com/'), 'https://yallahaul.com/')
})

test('the Host header decides, and the redirect is always https', () => {
  assert.equal(wwwRedirectTarget('http://internal/shop', 'WWW.YallaHaul.com'), 'https://yallahaul.com/shop')
})

test('the plain domain and the workers.dev address are left alone', () => {
  assert.equal(wwwRedirectTarget('https://yallahaul.com/shop'), null)
  assert.equal(wwwRedirectTarget('https://ecommerce-pro.georgeabdallah82.workers.dev/shop'), null)
  assert.equal(wwwRedirectTarget('https://452b1558-ecommerce-pro.georgeabdallah82.workers.dev/'), null)
  assert.equal(wwwRedirectTarget('http://localhost:3000/', 'localhost:3000'), null)
})
