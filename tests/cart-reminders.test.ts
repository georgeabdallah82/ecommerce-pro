import test from 'node:test'
import assert from 'node:assert/strict'
import { REMINDER_DEFAULTS, isSendableEmail, isValidUnsubscribeToken, readReminderSettings, reminderSkipReason, reminderWindow, unsubscribeToken, unsubscribeUrls, type ReminderFacts } from '../lib/cart-reminders'

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-cart-reminders'
const now = new Date('2026-10-15T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)
const on = { ...REMINDER_DEFAULTS, enabled: true }
const facts = (f: Partial<ReminderFacts> = {}): ReminderFacts => ({ email: 'maya@example.com', lastActivity: hoursAgo(4), optedOut: false, orderedSince: false, purchasableItems: 2, remindedRecently: false, ...f })

test('off unless the owner turns it on, with safe limits on every number', () => {
  assert.equal(readReminderSettings({}).enabled, false)
  assert.equal(readReminderSettings({ 'abandoned.autoSend': 'yes' }).enabled, false)
  assert.deepEqual(readReminderSettings({ 'abandoned.autoSend': 'true', 'abandoned.delayHours': '0', 'abandoned.maxAgeHours': '9999', 'abandoned.dailyLimit': 'lots' }), { enabled: true, delayHours: 1, maxAgeHours: 168, dailyLimit: 20 })
  // "Too late" always comes after "wait".
  assert.equal(readReminderSettings({ 'abandoned.delayHours': '24', 'abandoned.maxAgeHours': '2' }).maxAgeHours, 25)
})

test('only checkouts left between "wait" and "too late" are due', () => {
  const w = reminderWindow(now, on)
  assert.equal(w.to.toISOString(), hoursAgo(3).toISOString())
  assert.equal(w.from.toISOString(), hoursAgo(48).toISOString())
})

test('a reminder goes out only when every rule allows it', () => {
  assert.equal(reminderSkipReason(facts(), now, on), '')
  assert.equal(reminderSkipReason(facts({ email: 'not-an-email' }), now, on), 'No valid email address')
  assert.equal(reminderSkipReason(facts({ email: null }), now, on), 'No valid email address')
  assert.equal(reminderSkipReason(facts({ orderedSince: true }), now, on), 'Already ordered')
  assert.equal(reminderSkipReason(facts({ optedOut: true }), now, on), 'Unsubscribed from cart reminders')
  assert.equal(reminderSkipReason(facts({ lastActivity: hoursAgo(49) }), now, on), 'Too old to remind')
  assert.equal(reminderSkipReason(facts({ lastActivity: hoursAgo(1) }), now, on), 'Too early')
  assert.equal(reminderSkipReason(facts({ purchasableItems: 0 }), now, on), 'Nothing in the cart can be bought now')
  assert.equal(reminderSkipReason(facts({ remindedRecently: true }), now, on), 'Reminded in the last 7 days')
})

test('emails that cannot receive a reminder', () => {
  assert.equal(isSendableEmail(' Maya@Example.com '), true)
  for (const bad of ['', 'maya', 'maya@', '@example.com', 'maya@example', 'ma ya@example.com']) assert.equal(isSendableEmail(bad), false, bad)
})

test('unsubscribe links are signed per checkout and ask before unsubscribing', () => {
  const token = unsubscribeToken('chk_1')
  assert.equal(isValidUnsubscribeToken('chk_1', token), true)
  assert.equal(isValidUnsubscribeToken('chk_2', token), false)
  assert.equal(isValidUnsubscribeToken('chk_1', token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')), false)
  assert.equal(isValidUnsubscribeToken('chk_1', ''), false)
  const urls = unsubscribeUrls('https://yallahaul.com/', 'chk_1')
  assert.equal(urls.unsubscribeUrl, `https://yallahaul.com/unsubscribe?c=chk_1&t=${token}`)
  assert.equal(urls.oneClickUnsubscribeUrl, `https://yallahaul.com/api/unsubscribe?c=chk_1&t=${token}`)
  assert.equal(unsubscribeUrls('', 'chk_1').unsubscribeUrl, '')
})
