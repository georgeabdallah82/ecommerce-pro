import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STAFF_SESSION_SECONDS, staffSessionEnded } from '../lib/session-limits'
import { REAUTH_SECONDS, isFreshReauth } from '../lib/reauth'
import { UserError, userError } from '../lib/user-error'

const read = (path: string) => readFileSync(path, 'utf8')
const NOW = 1_800_000_000

test('a staff sign-in lasts 12 hours; customer sessions are not affected', () => {
  assert.equal(STAFF_SESSION_SECONDS, 12 * 60 * 60)
  assert.equal(staffSessionEnded('MANAGER', NOW - STAFF_SESSION_SECONDS, NOW), false, 'exactly at the limit still works')
  assert.equal(staffSessionEnded('MANAGER', NOW - STAFF_SESSION_SECONDS - 1, NOW), true)
  assert.equal(staffSessionEnded('SUPER_ADMIN', NOW - 13 * 3600, NOW), true)
  assert.equal(staffSessionEnded('CUSTOMER', NOW - 29 * 24 * 3600, NOW), false)
})

test('a confirmation lasts 10 minutes, and only for the account that gave it', () => {
  assert.equal(REAUTH_SECONDS, 10 * 60)
  const fresh = { sub: 'u1', type: 'reauth', exp: NOW + 60 }
  assert.equal(isFreshReauth(fresh, 'u1', NOW), true)
  assert.equal(isFreshReauth(fresh, 'u2', NOW), false, 'another account')
  assert.equal(isFreshReauth({ ...fresh, exp: NOW }, 'u1', NOW), false, 'expired at this second')
  assert.equal(isFreshReauth({ ...fresh, type: 'session' }, 'u1', NOW), false, 'a sign-in token is not a confirmation')
})

test('a refusal can carry a code, so the screen knows to ask the person to confirm', () => {
  const e = userError('Confirm it is you to continue.', 403, 'REAUTH_REQUIRED')
  assert.ok(e instanceof UserError)
  assert.equal(e.code, 'REAUTH_REQUIRED')
  assert.equal(e.status, 403)
  assert.equal(userError('Not enough stock').code, undefined)
})

test('refunds, role changes and removing a staff member check for a recent confirmation first', () => {
  assert.match(read('app/api/admin/refunds/route.ts'), /await assertRecentSignIn\(actor\)/)
  const users = read('app/api/admin/users/route.ts')
  assert.match(users, /if \(roleChanged\) await assertRecentSignIn\(actor\)/, 'saving other details does not ask')
  assert.match(users, /await assertRecentSignIn\(actor\)\n    const full = /, 'the removal asks before anything is deleted')
  assert.match(read('lib/auth.ts'), /throw userError\('Confirm it is you to continue\.', 403, 'REAUTH_REQUIRED'\)/)
})

test('the screens confirm when the server asks, then run the request once more', () => {
  assert.match(read('components/admin-reauth.tsx'), /\(error as \{ code\?: string \} \| null\)\?\.code !== 'REAUTH_REQUIRED'/)
  assert.match(read('components/admin-reauth.tsx'), /if \(!\(await askForConfirmation\(\)\)\) throw error\s+return run\(\)/)
  assert.match(read('components/orders-admin-shopify.tsx'), /runReauthed\(askForConfirmation, \(\) => api\('\/api\/admin\/refunds'/)
  assert.match(read('components/users-roles-admin.tsx'), /runReauthed\(askForConfirmation, \(\) => api\(`\/api\/admin\/users\?id=/)
  assert.match(read('components/users-roles-admin.tsx'), /runReauthed\(askForConfirmation, \(\) => api\('\/api\/admin\/users', \{ method: 'PATCH'/)
  assert.match(read('app/admin/layout.tsx'), /<ReauthProvider>\{children\}<\/ReauthProvider>/)
})

test('the confirmation route checks the password or a 2-step code, limits tries, and never echoes a secret', () => {
  const route = read('app/api/admin/reauth/route.ts')
  assert.match(route, /consumeDurableRateLimit\(limitKey, MAX_TRIES, WINDOW_MS\)/)
  assert.match(route, /verifyPassword\(password, user\.passwordHash\)/)
  assert.match(route, /confirmWithCode\(user, code\)/)
  assert.match(route, /totpLastStep: \{ lt: step \}/, 'a code counts once')
  assert.match(route, /await setReauth\(user\.id\)/)
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*(passwordHash|totp)/)
})

test('the staff session limit applies where a session is read: the route guards and the edge gate', () => {
  assert.match(read('lib/auth.ts'), /if \(staffSessionEnded\(user\.role, payload\.iat, Math\.floor\(Date\.now\(\) \/ 1000\)\)\) return null/)
  assert.match(read('proxy.ts'), /if \(staffSessionEnded\(user\?\.role \?\? 'CUSTOMER', payload\.iat, Math\.floor\(Date\.now\(\) \/ 1000\)\)\) return false/)
})
