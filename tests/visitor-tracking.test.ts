import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  HEARTBEAT_MS, IDLE_STOP_MS, LIVE_WINDOW_MS, SESSION_TTL_SECONDS, STAGES, describePath, isStaffUser, isTrackedPath, stageFromRank, stageOf, stageRank, storedPath,
} from '../lib/visitor-tracking'

test('store pages are counted; the admin, the editor preview and API calls are not', () => {
  for (const path of ['/', '/product/tissue', '/collections/home?sort=new', '/cart', '/checkout', '/account', '/blog/admin-tips']) {
    assert.equal(isTrackedPath(path), true, path)
  }
  for (const path of ['/admin', '/admin/orders', '/admin/login', '/admin-login', '/theme-editor-preview', '/theme-editor-preview?t=1', '/api/analytics/visit', '/maintenance', '/driver/abc']) {
    assert.equal(isTrackedPath(path), false, path)
  }
  assert.equal(isTrackedPath(''), true, 'an empty path is the home page')
})

test('signed-in staff are not visitors; shoppers and signed-in customers are', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR']) assert.equal(isStaffUser({ role }), true, role)
  assert.equal(isStaffUser({ role: 'CUSTOMER' }), false)
  assert.equal(isStaffUser(null), false)
  assert.equal(isStaffUser(undefined), false)
  assert.equal(isStaffUser({ role: null }), false)
})

test('timings: two missed reports still keep a shopper online, idle tabs stop well after that, a visit lasts 30 minutes', () => {
  assert.ok(HEARTBEAT_MS * 2 < LIVE_WINDOW_MS)
  assert.ok(IDLE_STOP_MS >= 5 * 60_000)
  assert.equal(SESSION_TTL_SECONDS, 1800)
})

test('each page belongs to one step of the visit', () => {
  assert.equal(stageOf('/'), 'browsing')
  assert.equal(stageOf('/collections/home'), 'browsing')
  assert.equal(stageOf('/product/tissue'), 'product')
  assert.equal(stageOf('/product/tissue?variant=2'), 'product')
  assert.equal(stageOf('/cart'), 'cart')
  assert.equal(stageOf('/cart/'), 'cart')
  assert.equal(stageOf('/checkout'), 'checkout')
  assert.equal(stageOf('/order/success?order=1001&t=abc'), 'ordered')
  assert.deepEqual(STAGES.map(stageRank), [0, 1, 2, 3, 4])
  assert.equal(stageFromRank(2), 'cart')
  assert.equal(stageFromRank(99), 'ordered')
  assert.equal(stageFromRank(-3), 'browsing')
  assert.equal(stageFromRank(Number.NaN), 'browsing')
})

test('pages are named; products and collections are named from the database by their address', () => {
  assert.deepEqual(describePath('/'), { kind: 'static', label: 'Home' })
  assert.deepEqual(describePath('/cart'), { kind: 'static', label: 'Cart' })
  assert.deepEqual(describePath('/checkout'), { kind: 'static', label: 'Checkout' })
  assert.deepEqual(describePath('/order/success'), { kind: 'static', label: 'Order confirmed' })
  assert.deepEqual(describePath('/product/soft-tissue'), { kind: 'product', label: 'Product', slug: 'soft-tissue' })
  assert.deepEqual(describePath('/collections/home-essentials'), { kind: 'collection', label: 'Collection', slug: 'home-essentials' })
  assert.equal(describePath('/some/very/long/unknown/page/address/that/goes/on').kind, 'other')
  assert.ok(describePath('/some/very/long/unknown/page/address/that/goes/on').label.length <= 40)
})

test('the stored page has no query string, fragment or trailing slash, and must be a path on this store', () => {
  assert.equal(storedPath('/order/success?order=1001&t=secret'), '/order/success')
  assert.equal(storedPath('/product/tissue/#reviews'), '/product/tissue')
  assert.equal(storedPath('/cart/'), '/cart')
  for (const bad of ['', 'cart', '//evil.example/x', 'https://evil.example', null, undefined, 12]) assert.equal(storedPath(bad), '/', String(bad))
  assert.equal(storedPath(`/${'a'.repeat(900)}`).length, 300)
})

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8')
const files = (dir: string): string[] => readdirSync(join(__dirname, '..', dir)).flatMap(name => {
  const path = join(dir, name)
  return statSync(join(__dirname, '..', path)).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})

test('admin pages use the admin link (no background prefetch of every admin link)', () => {
  const direct = [...files('app/admin'), 'components/admin-nav.tsx'].filter(path => /from ['"]next\/link['"]/.test(read(path)))
  assert.deepEqual(direct, [], 'import Link from @/components/admin-link in the admin')
  assert.match(read('components/admin-link.tsx'), /prefetch = false/)
})

test('ad pixels are only added on store pages', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /pixelsAllowed = isTrackedPath\(/)
  // Store pages only, and only after the shopper accepts (components/cookie-consent.tsx).
  assert.match(layout, /\{pixelsAllowed \? <ConsentTracking/)
  assert.match(read('components/cookie-consent.tsx'), /choice !== 'granted'\) return null/)
})
