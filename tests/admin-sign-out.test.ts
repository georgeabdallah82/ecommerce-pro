import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('signing a staff member out everywhere: manager permission, the existing revocation mark, audited', () => {
  const route = read('app/api/admin/users/sign-out/route.ts')
  assert.match(route, /requirePermission\('users\.manage'\)/)
  assert.match(route, /data: \{ sessionsRevokedAt: new Date\(\) \}/, 'sessions started before now stop working')
  assert.match(route, /audit\(actor\.id, 'user\.signed_out_everywhere'/)
})

test('the same guards as the other user actions: no customers, no self, super admins only by a super admin', () => {
  const route = read('app/api/admin/users/sign-out/route.ts')
  assert.match(route, /target\.role === 'CUSTOMER'/)
  assert.match(route, /target\.id === actor\.id/)
  assert.match(route, /target\.role === 'SUPER_ADMIN' && actor\.role !== 'SUPER_ADMIN'/)
})

test('the Users & roles screen offers it per person, behind a confirmation', () => {
  const screen = read('components/users-roles-admin.tsx')
  assert.match(screen, /Sign out everywhere<\/button>/)
  assert.match(screen, /confirmLabel: 'Sign out everywhere'/)
  assert.match(screen, /api\('\/api\/admin\/users\/sign-out', \{ method: 'POST'/)
})
