import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_CUSTOM_ROLES } from '../lib/staff-roles'
import { capRows } from '../lib/admin-list'

const read = (path: string) => readFileSync(path, 'utf8')

test('the custom role list has one cap, of 30 roles', () => {
  assert.equal(MAX_CUSTOM_ROLES, 30)
})

test('creating a role is refused at the cap, and the message names the cap', () => {
  const route = read('app/api/admin/roles/route.ts')
  assert.match(route, /if \(roles\.length >= MAX_CUSTOM_ROLES\) return json\(\{ error: `You can have up to \$\{MAX_CUSTOM_ROLES\} custom roles` \}, \{ status: 400, headers: noStore \}\)/)
})

test('the list read is capped to the same number and reports when it was cut', () => {
  const route = read('app/api/admin/roles/route.ts')
  assert.match(route, /const \{ rows, truncated \} = capRows\(await getStaffRoles\(\), MAX_CUSTOM_ROLES\)/)
  assert.match(route, /'X-Truncated': String\(truncated\)/)
})

test('a list longer than the cap is cut to it and flagged', () => {
  const roles = Array.from({ length: MAX_CUSTOM_ROLES + 1 }, (_, i) => ({ id: `role_${i}` }))
  const { rows, truncated } = capRows(roles, MAX_CUSTOM_ROLES)
  assert.equal(rows.length, MAX_CUSTOM_ROLES)
  assert.equal(truncated, true)
})
