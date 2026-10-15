import test from 'node:test'
import assert from 'node:assert/strict'
import { httpsRedirectTarget, wwwRedirectTarget } from '../lib/www-redirect'
import { applySecurityHeaders, securityHeaders } from '../lib/security-headers'

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

test('plain http visits go to the same page on https, once', () => {
  assert.equal(httpsRedirectTarget('http://yallahaul.com/product/tissue?ref=ig', { host: 'yallahaul.com' }), 'https://yallahaul.com/product/tissue?ref=ig')
  assert.equal(httpsRedirectTarget('http://yallahaul.com/', { cfVisitor: '{"scheme":"http"}', forwardedProto: 'http' }), 'https://yallahaul.com/')
  // http://www. goes straight to the plain domain, not through a second redirect.
  assert.equal(httpsRedirectTarget('http://www.yallahaul.com/shop', { host: 'www.yallahaul.com' }), 'https://yallahaul.com/shop')
})

test('a secure visit is never redirected, whatever the Worker sees as its address', () => {
  assert.equal(httpsRedirectTarget('https://yallahaul.com/'), null)
  assert.equal(httpsRedirectTarget('http://yallahaul.com/', { cfVisitor: '{"scheme":"https"}' }), null)
  assert.equal(httpsRedirectTarget('http://yallahaul.com/', { forwardedProto: 'https' }), null)
  assert.equal(httpsRedirectTarget('http://yallahaul.com/', { cfVisitor: 'not json', forwardedProto: 'https, http' }), null)
})

test('development addresses stay on http', () => {
  assert.equal(httpsRedirectTarget('http://localhost:3000/'), null)
  assert.equal(httpsRedirectTarget('http://127.0.0.1:8787/', { forwardedProto: 'http' }), null)
  assert.equal(httpsRedirectTarget('http://[::1]:3000/'), null)
  assert.equal(httpsRedirectTarget('http://internal/shop'), null)
  assert.equal(httpsRedirectTarget('http://shop.localhost/'), null)
  assert.equal(httpsRedirectTarget('http://192.168.1.20:3000/'), null)
})

test('security headers are sent once each, with HSTS only in production', () => {
  const prod = new Map(securityHeaders({ production: true }))
  assert.equal(prod.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains')
  assert.equal(prod.get('X-Frame-Options'), 'DENY')
  assert.equal(prod.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(self)')
  assert.equal(new Map(securityHeaders({ production: false })).has('Strict-Transport-Security'), false)
  assert.equal(new Map(securityHeaders({ framedBySameSite: true })).get('X-Frame-Options'), 'SAMEORIGIN')
  const response = applySecurityHeaders(new Response('ok', { headers: { 'X-Content-Type-Options': 'nosniff' } }), { production: true })
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', 'set, not appended')
})
