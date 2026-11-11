import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { publicUserSelect } from '@/lib/user-public'

const select = publicUserSelect as Record<string, unknown>

describe('lib/user-public publicUserSelect', () => {
  it('never selects a password hash, a two-step secret, backup codes or the session cut-off', () => {
    for (const column of ['passwordHash', 'totpSecret', 'totpBackupCodes', 'totpLastStep', 'sessionsRevokedAt']) assert.equal(select[column], undefined, column)
  })

  it('keeps the columns the admin screens show', () => {
    for (const column of ['id', 'name', 'email', 'phone', 'role']) assert.equal(select[column], true, column)
  })
})

// Order screens include the customer and the note author. A plain `user: true` sends the whole row,
// password hash included, to the browser.
const SCREENS = ['app/api/admin/orders/route.ts', 'app/admin/orders/page.tsx', 'app/admin/page.tsx', 'app/admin/orders/[id]/page.tsx']

describe('admin screens include users through the safe select', () => {
  for (const file of SCREENS) {
    it(file, () => {
      const source = readFileSync(file, 'utf8')
      assert.doesNotMatch(source, /user:\s*true\b/, 'a plain user include sends every column')
      assert.match(source, /publicUserSelect/)
    })
  }

  it('the staff users list uses the same select', () => {
    assert.match(readFileSync('app/api/admin/users/route.ts', 'utf8'), /publicUserSelect as safeUserSelect/)
  })
})
