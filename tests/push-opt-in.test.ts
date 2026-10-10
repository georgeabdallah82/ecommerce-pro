import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PUSH_PROMPT_SNOOZE_DAYS, isPushServiceEndpoint, parsePushSubscription, sameApplicationServerKey,
  shouldOfferPush, urlBase64ToUint8Array, type PushOfferInput,
} from '../lib/push-opt-in'

const NOW = Date.UTC(2026, 9, 10, 12)
const base: PushOfferInput = { enabled: true, hasKey: true, supported: true, permission: 'default', subscribed: false, pathname: '/', dismissedAt: null, now: NOW }

test('a new visitor on a store page is offered notifications', () => {
  assert.equal(shouldOfferPush(base), true)
  assert.equal(shouldOfferPush({ ...base, pathname: '/product/tissue' }), true)
  // Allowed for the admin's order alerts, but not on the customer list yet: still offered.
  assert.equal(shouldOfferPush({ ...base, permission: 'granted' }), true)
})

test('never offered when switched off, unsupported, blocked or already subscribed', () => {
  assert.equal(shouldOfferPush({ ...base, enabled: false }), false)
  assert.equal(shouldOfferPush({ ...base, hasKey: false }), false)
  assert.equal(shouldOfferPush({ ...base, supported: false }), false, 'iPhone Safari outside a home-screen app has no web push')
  assert.equal(shouldOfferPush({ ...base, permission: 'denied' }), false)
  assert.equal(shouldOfferPush({ ...base, subscribed: true }), false)
})

test('never on checkout, in the admin, or on the account page that has its own switch', () => {
  for (const pathname of ['/checkout', '/checkout/success', '/admin', '/admin/orders', '/theme-editor-preview', '/account/notifications']) {
    assert.equal(shouldOfferPush({ ...base, pathname }), false, pathname)
  }
  assert.equal(shouldOfferPush({ ...base, pathname: '/administration-tips' }), true, 'only whole path segments count')
})

test('"Not now" hides it for 30 days', () => {
  const day = 86_400_000
  assert.equal(shouldOfferPush({ ...base, dismissedAt: NOW - 3 * day }), false)
  assert.equal(shouldOfferPush({ ...base, dismissedAt: NOW - (PUSH_PROMPT_SNOOZE_DAYS - 1) * day }), false)
  assert.equal(shouldOfferPush({ ...base, dismissedAt: NOW - (PUSH_PROMPT_SNOOZE_DAYS + 1) * day }), true)
})

test('only real browser push services are accepted as subscription addresses', () => {
  assert.equal(isPushServiceEndpoint('https://fcm.googleapis.com/fcm/send/abc:APA91b'), true)
  assert.equal(isPushServiceEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAAA'), true)
  assert.equal(isPushServiceEndpoint('https://web.push.apple.com/QGuQyavXut'), true)
  assert.equal(isPushServiceEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'), true)
  assert.equal(isPushServiceEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false, 'https only')
  assert.equal(isPushServiceEndpoint('https://evil.example/fcm.googleapis.com'), false)
  assert.equal(isPushServiceEndpoint('https://fcm.googleapis.com.evil.example/x'), false)
  assert.equal(isPushServiceEndpoint('https://user:pass@fcm.googleapis.com/x'), false)
  assert.equal(isPushServiceEndpoint('https://fcm.googleapis.com:8443/x'), false)
  assert.equal(isPushServiceEndpoint('not a url'), false)
})

test('a browser subscription is checked before it is saved', () => {
  const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }
  assert.deepEqual(parsePushSubscription(good), { endpoint: good.endpoint, p256dh: good.keys.p256dh, auth: good.keys.auth })
  assert.throws(() => parsePushSubscription(null), /Invalid push subscription/)
  assert.throws(() => parsePushSubscription({ endpoint: good.endpoint }), /Invalid push subscription/)
  assert.throws(() => parsePushSubscription({ ...good, keys: { ...good.keys, auth: '<script>' } }), /Invalid push subscription/)
  assert.throws(() => parsePushSubscription({ ...good, endpoint: 'https://attacker.example/collect' }), /Invalid push endpoint/)
  assert.throws(() => parsePushSubscription({ ...good, endpoint: `https://fcm.googleapis.com/${'a'.repeat(1000)}` }), /Invalid push subscription/)
})

test('the VAPID key is turned into bytes, and an existing subscription is reused only for the same key', () => {
  const key = urlBase64ToUint8Array('AQIDBA')
  assert.deepEqual([...key], [1, 2, 3, 4])
  assert.equal(sameApplicationServerKey(new Uint8Array([1, 2, 3, 4]).buffer, key), true)
  assert.equal(sameApplicationServerKey(new Uint8Array([1, 2, 3, 5]).buffer, key), false)
  assert.equal(sameApplicationServerKey(null, key), false)
})
