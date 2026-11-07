import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Two-step login is mandatory for staff: the password alone never starts a session, a staff
// session without 2-step login is refused everywhere, and staff cannot switch it off themselves.
const read = (file: string) => readFileSync(file, 'utf8')

describe('staff sign-in: the password alone never starts a session', () => {
  it('a correct password without 2-step login sends the set-up ticket, not a session', () => {
    const route = read('app/api/admin/login/route.ts')
    assert.match(route, /await setEnrollTicket\(user\.id\)/)
    assert.match(route, /needsEnrollment: true/)
    // The only setSession left in the sign-in route is the one behind the 2-step code.
    assert.doesNotMatch(route, /setSession/)
  })
  it('the set-up route only works with the set-up ticket and only for staff who are not yet set up', () => {
    const route = read('app/api/admin/login/enroll/route.ts')
    assert.match(route, /readEnrollTicket\(\)/)
    assert.match(route, /user\.role === 'CUSTOMER' \|\| user\.totpEnabledAt/)
    assert.match(route, /consumeDurableRateLimit\(`admin-enroll:/)
  })
  it('the first correct code turns 2-step login on, revokes old sessions, then starts the session', () => {
    const route = read('app/api/admin/login/enroll/route.ts')
    const turnOn = route.indexOf('totpEnabledAt: new Date()')
    const revoke = route.indexOf('sessionsRevokedAt: new Date()')
    const session = route.indexOf('await setSession(user.id)')
    assert.ok(turnOn > 0 && revoke > 0 && session > 0)
    assert.ok(session > turnOn, 'session starts only after 2-step is on')
  })
  it('the sign-in screen offers the set-up with a QR code and the key', () => {
    const form = read('app/admin/login/admin-login-form.tsx')
    assert.match(form, /data\.needsEnrollment/)
    assert.match(form, /<QrCode text=\{enrollSetup\.uri\}/)
    assert.match(form, /enrollSetup\.secret/)
    assert.match(form, /backupCodes\.map/)
  })
})

describe('a staff session without 2-step login is refused everywhere', () => {
  it('getCurrentUser returns nobody for staff who are not set up', () => {
    assert.match(read('lib/auth.ts'), /user\.role !== 'CUSTOMER' && !user\.totpEnabledAt\) return null/)
  })
  it('the maintenance bypass for staff needs 2-step login too', () => {
    assert.match(read('proxy.ts'), /user\.role !== 'CUSTOMER' && !!user\.totpEnabled/)
    assert.match(read('lib/edge-db.ts'), /"totpEnabledAt" FROM "User"/)
  })
})

describe('staff cannot switch their own 2-step login off', () => {
  it('turning it off is refused for staff; backup codes still work', () => {
    const route = read('app/api/admin/two-step/route.ts')
    assert.match(route, /action === 'off' && user\.role !== 'CUSTOMER'/)
    assert.match(route, /ask the store owner to reset it/)
  })
  it('a manager can still reset it for someone who lost their phone (they then set it up again)', () => {
    assert.match(read('app/api/admin/users/route.ts'), /twoStepOff/)
  })
})
