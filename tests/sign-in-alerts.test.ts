import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  MAX_DEVICES, describeDevice, describeEvent, hashDevice, isDeviceCookie, newDeviceCookie, parseDevices,
  securityAlertText, touchDevice, type KnownDevice,
} from '@/lib/sign-in-devices'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

describe('sign-in alerts: naming the device', () => {
  it('says which browser and system, in words the owner knows', () => {
    assert.equal(describeDevice(CHROME_ANDROID), 'Chrome on Android')
    assert.equal(describeDevice(SAFARI_IPHONE), 'Safari on iPhone')
    assert.equal(describeDevice(EDGE_WINDOWS), 'Edge on Windows')
    assert.equal(describeDevice(FIREFOX_LINUX), 'Firefox on Linux')
    assert.equal(describeDevice(''), 'Unknown device')
    assert.equal(describeDevice(null), 'Unknown device')
  })
})

describe('sign-in alerts: remembering devices', () => {
  const t1 = new Date('2026-10-17T10:00:00Z')
  const t2 = new Date('2026-10-18T10:00:00Z')

  it('a browser seen for the first time is new, and known afterwards', () => {
    const first = touchDevice([], { id: 'aaa', label: 'Chrome on Android', country: 'LB' }, t1)
    assert.equal(first.isNew, true)
    assert.equal(first.devices.length, 1)
    const again = touchDevice(first.devices, { id: 'aaa', label: 'Chrome on Android', country: 'LB' }, t2)
    assert.equal(again.isNew, false)
    assert.equal(again.devices[0].first, t1.toISOString(), 'first seen stays')
    assert.equal(again.devices[0].last, t2.toISOString(), 'last seen moves')
  })

  it('a different browser is new even with the same account', () => {
    const one = touchDevice([], { id: 'aaa', label: 'Chrome on Android', country: 'LB' }, t1).devices
    const two = touchDevice(one, { id: 'bbb', label: 'Edge on Windows', country: 'FR' }, t2)
    assert.equal(two.isNew, true)
    assert.deepEqual(two.devices.map(d => d.id), ['bbb', 'aaa'], 'newest first')
  })

  it('keeps only the most recently used devices', () => {
    let list: KnownDevice[] = []
    for (let i = 0; i < MAX_DEVICES + 5; i++) list = touchDevice(list, { id: `d${i}`, label: 'x', country: '' }, new Date(t1.getTime() + i * 1000)).devices
    assert.equal(list.length, MAX_DEVICES)
    assert.ok(!list.some(d => d.id === 'd0'), 'the oldest dropped off')
  })

  it('reads a damaged or missing list as empty', () => {
    assert.deepEqual(parseDevices(undefined), [])
    assert.deepEqual(parseDevices('not json'), [])
    assert.deepEqual(parseDevices('{"a":1}'), [])
    assert.deepEqual(parseDevices('[{"id":5},{"id":"x","label":"Chrome on Android","country":"lb","first":"a","last":"b"}]'), [{ id: 'x', label: 'Chrome on Android', country: 'LB', first: 'a', last: 'b' }])
  })

  it('stores only a hash, different for each account', async () => {
    const cookie = newDeviceCookie()
    assert.ok(isDeviceCookie(cookie), 'the cookie value is the shape we accept')
    assert.equal(isDeviceCookie('short'), false)
    assert.equal(isDeviceCookie(undefined), false)
    const a = await hashDevice(cookie, 'user-1')
    const b = await hashDevice(cookie, 'user-2')
    assert.match(a, /^[0-9a-f]{24}$/)
    assert.notEqual(a, b)
    assert.equal(a, await hashDevice(cookie, 'user-1'))
    assert.ok(!a.includes(cookie))
  })
})

describe('sign-in alerts: the words', () => {
  const at = new Date('2026-10-17T10:05:00Z')

  it('a new device: says who, where, and what to do if it was not them', () => {
    const m = securityAlertText({ kind: 'new_device', who: 'George (g@example.org)', device: 'Chrome on Android', country: 'Lebanon', at })
    assert.match(m.subject, /New sign-in to your admin: Chrome on Android/)
    assert.match(m.push.body, /Chrome on Android · Lebanon/)
    const text = m.lines.join('\n')
    assert.match(text, /Time: 2026-10-17 10:05 UTC/)
    assert.match(text, /Sign out everywhere/)
    assert.doesNotMatch(text, /first sign-in since/)
  })

  it('the first sign-in after alerts were switched on explains why it shows up', () => {
    const m = securityAlertText({ kind: 'new_device', who: 'g@example.org', device: 'Safari on iPhone', at, firstSignIn: true })
    assert.match(m.lines.join('\n'), /first sign-in since sign-in alerts were turned on/)
  })

  it('lockouts say it was locked and for how long', () => {
    const pass = securityAlertText({ kind: 'password_lockout', who: 'g@example.org', at })
    assert.match(pass.subject, /guessing the password/)
    assert.match(pass.lines.join('\n'), /locked for 15 minutes/)
    const code = securityAlertText({ kind: 'code_lockout', who: 'g@example.org', at })
    assert.match(code.lines.join('\n'), /right password/)
    assert.match(code.lines.join('\n'), /did not get in/)
  })

  it('describes events for the Recent activity list', () => {
    assert.equal(describeEvent('admin.sign_in', { device: 'Chrome on Android', country: 'Lebanon' }), 'Signed in · Chrome on Android · Lebanon')
    assert.equal(describeEvent('admin.sign_in.new_device', { device: 'Edge on Windows' }), 'Signed in from a new device · Edge on Windows')
    assert.equal(describeEvent('admin.lockout', null), 'Locked after wrong passwords')
    assert.equal(describeEvent('user.sessions_revoked', null), 'Signed out everywhere')
  })
})

describe('sign-in alerts: wired into the sign-in', () => {
  const read = (path: string) => readFileSync(path, 'utf8')

  it('both ways of signing in record the device after the session is set', () => {
    assert.match(read('app/api/admin/login/route.ts'), /await setSession\(user\.id\)\n  await recordSignIn\(request\.headers, user\)/)
    assert.match(read('app/api/admin/login/code/route.ts'), /await setSession\(user\.id\)\n  await recordSignIn\(request\.headers, user\)/)
  })

  it('an account locked by wrong passwords or wrong codes raises the alert', () => {
    assert.match(read('app/api/admin/login/route.ts'), /if \(lockedUntil && user && user\.isActive[^\n]*await alertLockout\(request\.headers, user, 'password_lockout'\)/)
    assert.match(read('app/api/admin/login/code/route.ts'), /limit\.remaining === 0\) await alertLockout\(request\.headers, user, 'code_lockout'\)/)
  })

  it('the list of known devices cannot be read or changed through the generic settings API', () => {
    assert.match(read('app/api/admin/settings/route.ts'), /PRIVATE_PREFIXES = \['push\.subscription\.', 'security\.devices\.', 'payment\.areeba\.apiPassword'\]/)
  })

  it('the push goes only to the account and the super admins, never to every staff device', () => {
    const push = read('lib/push.ts')
    assert.match(push, /export async function sendSecurityAlertPush\(userIds: string\[\]/)
    assert.match(push, /if \(!userIds\.length\) return/)
  })
})
