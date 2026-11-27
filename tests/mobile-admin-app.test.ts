import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-the-android-admin-app-0123456789'

import { bearerToken, cleanInstallId, mobileSessionToken, mobileTwoStepTicket, readMobileSession, readMobileTwoStepTicket, MOBILE_AUDIENCE, MOBILE_TOKEN_SECONDS } from '../lib/mobile-auth'
import { alertKind, appPath, cleanFcmToken, cleanPrefs, DEFAULT_PREFS, parseDevice, parseStaffAlertType, staffAlertType } from '../lib/mobile-devices'
import { customerName, nextStatuses, parseAddress } from '../lib/mobile-orders'
import { fcmData, readServiceAccount } from '../lib/fcm'
import { STAFF_SESSION_SECONDS } from '../lib/session-limits'
import { isBlockedDuringMaintenance } from '../lib/maintenance-paths'

const read = (path: string) => readFileSync(path, 'utf8')
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!)

describe('the Android admin app token', () => {
  test('a session token reads back with who and when, and lasts one staff shift', async () => {
    const token = await mobileSessionToken('user_1')
    const claims = await readMobileSession(token)
    assert.equal(claims?.sub, 'user_1')
    assert.equal(typeof claims?.iat, 'number')
    assert.equal(MOBILE_TOKEN_SECONDS, STAFF_SESSION_SECONDS)
    assert.equal((claims!.exp! - claims!.iat), STAFF_SESSION_SECONDS)
  })

  test('the browser session cookie token is not accepted as an app token', async () => {
    const cookieToken = await new SignJWT({ sub: 'user_1', type: 'session' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret())
    assert.equal(await readMobileSession(cookieToken), null)
  })

  test('a 2-step ticket is not a session, and a session is not a ticket', async () => {
    const ticket = await mobileTwoStepTicket('user_2')
    assert.equal(await readMobileSession(ticket), null)
    assert.equal(await readMobileTwoStepTicket(ticket), 'user_2')
    assert.equal(await readMobileTwoStepTicket(await mobileSessionToken('user_2')), null)
  })

  test('a token signed with another secret, for another audience, or expired is refused', async () => {
    const forged = await new SignJWT({ sub: 'user_1', type: 'mobile' }).setProtectedHeader({ alg: 'HS256' }).setAudience(MOBILE_AUDIENCE).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('not-the-secret'))
    assert.equal(await readMobileSession(forged), null)
    const otherAudience = await new SignJWT({ sub: 'user_1', type: 'mobile' }).setProtectedHeader({ alg: 'HS256' }).setAudience('someone-else').setIssuedAt().setExpirationTime('1h').sign(secret())
    assert.equal(await readMobileSession(otherAudience), null)
    const expired = await new SignJWT({ sub: 'user_1', type: 'mobile' }).setProtectedHeader({ alg: 'HS256' }).setAudience(MOBILE_AUDIENCE).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(secret())
    assert.equal(await readMobileSession(expired), null)
  })

  test('only a well-formed Bearer header is read', () => {
    assert.equal(bearerToken('Bearer abcdefghijklmnopqrstuvwxyz.123'), 'abcdefghijklmnopqrstuvwxyz.123')
    assert.equal(bearerToken('Basic abcdefghijklmnopqrstuvwxyz'), null)
    assert.equal(bearerToken('Bearer short'), null)
    assert.equal(bearerToken('Bearer abc def ghi jkl mno pqr stu'), null)
    assert.equal(bearerToken(null), null)
  })

  test('the install id has the same shape as the browser device cookie', () => {
    assert.equal(cleanInstallId('A'.repeat(32)), 'A'.repeat(32))
    assert.equal(cleanInstallId('A'.repeat(31)), null)
    assert.equal(cleanInstallId('../../etc/passwd/aaaaaaaaaaaaaaaaaaaaa'), null)
  })
})

describe('getCurrentUser accepts the app token with every existing rule', () => {
  const auth = read('lib/auth.ts')
  test('the cookie still comes first, the bearer token only without one', () => {
    assert.match(auth, /const token = \(await cookies\(\)\)\.get\('session'\)\?\.value\n  if \(token\) \{/)
    assert.match(auth, /readMobileSession\(bearerToken\(\(await headers\(\)\)\.get\('authorization'\)\)\)/)
  })
  test('customers never get in with an app token', () => {
    assert.match(auth, /if \(payload\.app && user\.role === 'CUSTOMER'\) return null/)
  })
  test('revocation, 2-step login and the shift limit still apply to both', () => {
    assert.match(auth, /if \(user\.role !== 'CUSTOMER' && !user\.totpEnabledAt\) return null/)
    assert.match(auth, /if \(isSessionRevoked\(payload\.iat, user\.sessionsRevokedAt\)\) return null/)
    assert.match(auth, /if \(staffSessionEnded\(user\.role, payload\.iat, Math\.floor\(Date\.now\(\) \/ 1000\)\)\) return null/)
  })
})

describe('app sign-in follows the web sign-in rules', () => {
  const login = read('app/api/mobile/v1/auth/login/route.ts')
  const code = read('app/api/mobile/v1/auth/code/route.ts')
  test('the password step shares the web limits and lockout, and never returns a session', () => {
    assert.match(login, /`admin-login:ip:\$\{clientIp\(request\.headers\)\}`/)
    assert.match(login, /`admin-login:email:\$\{email\}`/)
    assert.match(login, /db\.adminLoginLockout\.upsert/)
    assert.match(login, /code: 'ENROLL_REQUIRED'/)
    assert.doesNotMatch(login, /mobileSessionToken|setSession/)
  })
  test('the code step shares the web counter and refuses a used code', () => {
    assert.match(code, /const limitKey = `admin-2step:\$\{userId\}`/)
    assert.match(code, /totpLastStep: \{ lt: step \}/)
    assert.match(code, /This code was already used/)
    assert.match(code, /recordAppSignIn\(request\.headers, user, installId\)/)
    const token = code.indexOf('await mobileSessionToken(user.id)')
    const check = code.indexOf('matchTotp(secret, code')
    assert.ok(check > 0 && token > check, 'the token is made only after the code checked out')
  })
  test('sign out everywhere uses the existing revocation mark', () => {
    assert.match(read('app/api/mobile/v1/auth/logout/route.ts'), /data: \{ sessionsRevokedAt: new Date\(\) \}/)
  })
  test('app answers are private and the app keeps working in maintenance', () => {
    assert.match(read('proxy.ts'), /if \(isApi && \(hasSession \|\| request\.headers\.has\('authorization'\)\)\)/)
    assert.equal(isBlockedDuringMaintenance('/api/mobile/v1/devices', 'PUT'), false)
    assert.equal(isBlockedDuringMaintenance('/api/checkout', 'POST'), true)
  })
  test('every app route checks the signed-in person', () => {
    for (const route of ['me', 'dashboard', 'orders/[id]', 'inventory', 'notifications', 'devices', 'auth/logout']) {
      assert.match(read(`app/api/mobile/v1/${route}/route.ts`), /await require(Permission|Staff)\(/, route)
    }
  })
})

describe('app alerts', () => {
  test('each staff alert is sorted by the flags its sender sets', () => {
    assert.equal(alertKind({ title: 'New order received', orderId: 'o1' }), 'orders')
    assert.equal(alertKind({ lowStock: true }), 'lowStock')
    assert.equal(alertKind({ security: true }), 'security')
    assert.equal(alertKind({ dailySummary: true }), 'summary')
    assert.equal(alertKind({ orderProblem: true }), 'orders')
    assert.equal(alertKind({ title: 'New review submitted' }), 'messages')
    assert.equal(alertKind({ test: true }), null)
  })
  test('the history type keeps the kind and the screen to open', () => {
    assert.deepEqual(parseStaffAlertType(staffAlertType('orders', '/admin/orders/abc')), { kind: 'orders', path: '/admin/orders/abc' })
    assert.equal(parseStaffAlertType('ORDER_STATUS'), null)
    assert.equal(parseStaffAlertType('staff.unknown|/admin'), null)
    assert.equal(appPath('https://evil.example/'), '/admin')
    assert.equal(appPath('/admin/orders/<script>'), '/admin')
  })
  test('preferences keep only known switches', () => {
    assert.deepEqual(cleanPrefs({ orders: false, lowStock: 'no', extra: true }), { ...DEFAULT_PREFS, orders: false })
    assert.equal(parseDevice('not json'), null)
    assert.equal(parseDevice(JSON.stringify({ userId: 'u', installId: 'i', prefs: { summary: false } }))?.prefs.summary, false)
    assert.equal(cleanFcmToken('short'), null)
    assert.ok(cleanFcmToken('fcm-token_abc:DEF-1234567890.xyz'))
  })
  test('every staff alert also reaches the app phones, browser push or not', () => {
    const push = read('lib/push.ts')
    assert.match(push, /source === 'staff' && !onlyEndpoint \? pushToStaffApps\(payload, \{ onlyUserId, allowedUserIds \}\)/)
    assert.match(push, /if \(!configure\(\)\) \{ await apps; return/)
  })
  test('Firebase is read from a server secret and data values are strings', () => {
    assert.equal(readServiceAccount(undefined), null)
    assert.equal(readServiceAccount('{"project_id":"p"}'), null)
    assert.deepEqual(fcmData({ a: 'x', b: 2, c: null }), { a: 'x', b: '2' })
  })
})

describe('order shapes for the app', () => {
  test('the customer name comes from the account, else the delivery address', () => {
    assert.equal(customerName({ user: { name: 'Rana' }, shippingAddressJson: '{}' }), 'Rana')
    assert.equal(customerName({ user: null, shippingAddressJson: JSON.stringify({ firstName: 'Sami', lastName: 'Haddad' }) }), 'Sami Haddad')
    assert.equal(customerName({ user: null, shippingAddressJson: 'broken', email: 'a@b.co' }), 'a@b.co')
  })
  test('the address keeps text fields only', () => {
    assert.deepEqual(parseAddress(JSON.stringify({ city: 'Beirut', nested: { x: 1 }, zip: 1200 })), { city: 'Beirut', zip: '1200' })
  })
  test('the app never offers a refund as a status, and follows the store transitions', () => {
    assert.deepEqual(nextStatuses('PENDING'), ['CONFIRMED', 'CANCELLED'])
    assert.deepEqual(nextStatuses('DELIVERED'), [])
    assert.deepEqual(nextStatuses('CANCELLED'), [])
  })
})
