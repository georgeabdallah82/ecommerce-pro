import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Admin actions that change something or send something to customers must leave a history entry
// (who did it, when) through the shared helper, so the owner can always answer "who did this?".
const ROUTES: Array<[string, RegExp]> = [
  ['app/api/admin/imports/route.ts', /audit\(actor\.id, 'ADMIN_IMPORT', 'products'/],
  ['app/api/admin/imports/route.ts', /audit\(actor\.id, 'ADMIN_IMPORT', 'collections'/],
  ['app/api/admin/marketing/push-campaign/route.ts', /audit\(actor\.id, 'ADMIN_PUSH_CAMPAIGN'/],
  ['app/api/admin/orders/[id]/delivery-tracking/route.ts', /audit\(actor\?\.id, disable \? 'DELIVERY_TRACKING_DISABLED' : 'DELIVERY_TRACKING_UPDATED'/],
  ['app/api/admin/tracking/meta-test/route.ts', /audit\(actor\.id, 'TRACKING_META_TEST'/],
]

describe('admin history entries', () => {
  for (const [file, pattern] of ROUTES) {
    it(`${file} records ${pattern.source.match(/'([A-Z_]+)'/)?.[1] || 'its action'}`, () => {
      assert.match(readFileSync(file, 'utf8'), pattern)
    })
  }
  it('the Meta connection test never records the access token', () => {
    const source = readFileSync('app/api/admin/tracking/meta-test/route.ts', 'utf8')
    const line = source.split('\n').find(l => l.includes('TRACKING_META_TEST')) || ''
    assert.ok(!/token|secret|testCode/i.test(line), line)
  })
})
