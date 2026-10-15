import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HEARTBEAT_MS, IDLE_STOP_MS, LIVE_WINDOW_MS, isStaffUser, isTrackedPath, leftAt } from '../lib/visitor-tracking'

test('store pages are counted; the admin, the editor preview and API calls are not', () => {
  for (const path of ['/', '/product/tissue', '/collections/home?sort=new', '/cart', '/checkout', '/account', '/blog/admin-tips']) {
    assert.equal(isTrackedPath(path), true, path)
  }
  for (const path of ['/admin', '/admin/orders', '/admin/login', '/admin-login', '/theme-editor-preview', '/theme-editor-preview?t=1', '/api/analytics/visitor', '/maintenance']) {
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

test('a shopper who leaves drops out of "now" at once but still counts for today', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  const left = leftAt(now)
  assert.ok(now.getTime() - left.getTime() > LIVE_WINDOW_MS, 'outside the live window')
  assert.ok(now.getTime() - left.getTime() < 24 * 3600_000, 'inside today')
})

test('timings: two missed reports still keep a shopper live, and idle tabs stop well after that', () => {
  assert.ok(HEARTBEAT_MS * 2 < LIVE_WINDOW_MS)
  assert.ok(IDLE_STOP_MS >= 5 * 60_000)
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
  assert.match(layout, /\{pixelsAllowed \? <TrackingScripts/)
})
