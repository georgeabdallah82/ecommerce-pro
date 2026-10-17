import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { GUEST_CANCEL_MESSAGES, guestCancelConfig, guestCancelState } from '@/lib/guest-cancel'

const read = (path: string) => readFileSync(path, 'utf8')
const placedAt = new Date('2026-06-01T10:00:00Z')
const minutesAfter = (m: number) => new Date(placedAt.getTime() + m * 60 * 1000)
const fresh = { status: 'PENDING', paymentStatus: 'UNPAID', createdAt: placedAt }
const on = { enabled: true, minutes: 30 }

describe('cancel without an account: the owner\'s settings', () => {
  it('is on for 30 minutes unless the owner changes it', () => {
    assert.deepEqual(guestCancelConfig({}), { enabled: true, minutes: 30 })
    assert.deepEqual(guestCancelConfig(new Map()), { enabled: true, minutes: 30 })
  })

  it('can be switched off, and only "false" switches it off', () => {
    assert.equal(guestCancelConfig({ 'orders.guestCancel.enabled': 'false' }).enabled, false)
    assert.equal(guestCancelConfig({ 'orders.guestCancel.enabled': 'true' }).enabled, true)
    assert.equal(guestCancelConfig({ 'orders.guestCancel.enabled': '' }).enabled, true)
  })

  it('keeps the time between 5 minutes and 4 hours, and ignores nonsense', () => {
    assert.equal(guestCancelConfig({ 'orders.guestCancel.minutes': '60' }).minutes, 60)
    assert.equal(guestCancelConfig({ 'orders.guestCancel.minutes': '1' }).minutes, 5)
    assert.equal(guestCancelConfig({ 'orders.guestCancel.minutes': '9999' }).minutes, 240)
    assert.equal(guestCancelConfig({ 'orders.guestCancel.minutes': '45 min' }).minutes, 45)
    for (const bad of ['', 'abc', '0', '-20']) assert.equal(guestCancelConfig({ 'orders.guestCancel.minutes': bad }).minutes, 30, `"${bad}"`)
  })
})

describe('cancel without an account: when it is allowed', () => {
  it('a new, unpaid order can be cancelled, and the customer is told how long is left', () => {
    const s = guestCancelState(fresh, on, minutesAfter(10))
    assert.equal(s.allowed, true)
    if (s.allowed) {
      assert.equal(s.secondsLeft, 20 * 60)
      assert.equal(s.deadline.getTime(), minutesAfter(30).getTime())
    }
  })

  it('stops exactly when the time is up', () => {
    assert.equal(guestCancelState(fresh, on, minutesAfter(29)).allowed, true)
    assert.deepEqual(guestCancelState(fresh, on, minutesAfter(30)), { allowed: false, reason: 'late' })
    assert.deepEqual(guestCancelState(fresh, on, minutesAfter(31)), { allowed: false, reason: 'late' })
  })

  it('stops as soon as the owner confirms the order, however early it is', () => {
    for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']) {
      assert.deepEqual(guestCancelState({ ...fresh, status }, on, minutesAfter(1)), { allowed: false, reason: 'status' }, status)
    }
  })

  it('never cancels an order that was paid online (that is a refund, not a cancel)', () => {
    assert.deepEqual(guestCancelState({ ...fresh, paymentStatus: 'PAID' }, on, minutesAfter(1)), { allowed: false, reason: 'paid' })
    assert.deepEqual(guestCancelState({ ...fresh, paymentStatus: 'PARTIALLY_REFUNDED' }, on, minutesAfter(1)), { allowed: false, reason: 'paid' })
  })

  it('does nothing when the owner switched it off', () => {
    assert.deepEqual(guestCancelState(fresh, { enabled: false, minutes: 30 }, minutesAfter(1)), { allowed: false, reason: 'off' })
  })

  it('uses the owner\'s time, and understands a date sent as text', () => {
    assert.equal(guestCancelState(fresh, { enabled: true, minutes: 60 }, minutesAfter(45)).allowed, true)
    assert.equal(guestCancelState({ ...fresh, createdAt: placedAt.toISOString() }, on, minutesAfter(5)).allowed, true)
    assert.equal(guestCancelState({ ...fresh, createdAt: 'not a date' }, on, minutesAfter(5)).allowed, false)
  })

  it('every reason has a plain message for the customer', () => {
    assert.deepEqual(Object.keys(GUEST_CANCEL_MESSAGES).sort(), ['late', 'off', 'paid', 'status'])
    for (const message of Object.values(GUEST_CANCEL_MESSAGES)) assert.match(message, /WhatsApp|contact us/i)
  })
})

describe('cancel without an account: how it is wired', () => {
  const route = read('app/api/orders/cancel/route.ts')

  it('needs proof of the order, and answers the same whether the order exists or not', () => {
    assert.match(route, /canViewOrder\(order, \{ userId: user\?\.id, token:/)
    assert.match(route, /throw new Error\(NOT_FOUND\)/)
  })

  it('is rate limited per address and per order', () => {
    assert.match(route, /consumeDurableRateLimit\(`order-cancel:ip:/)
    assert.match(route, /consumeDurableRateLimit\(`order-cancel:order:/)
  })

  it('claims the order in the same step, so a cancel and a confirm at the same moment cannot both win', () => {
    assert.match(route, /updateMany\(\{ where: \{ id: order\.id, status: 'PENDING' \}, data: \{ status: 'CANCELLED' \} \}\)/)
  })

  it('gives back the stock, the coupon use, the coins and the gift card like the account cancel does', () => {
    assert.match(route, /cancelOrderForCustomer\(tx, order,/)
    assert.match(read('app/api/account/orders/[orderNumber]/cancel/route.ts'), /cancelOrderForCustomer\(tx, order,/)
    const shared = read('lib/customer-cancel.ts')
    assert.match(shared, /releaseOrderReservations/)
    assert.match(shared, /usedCount: \{ decrement: 1 \}/)
    assert.match(shared, /restoreGiftCardBalance/)
    assert.match(shared, /type: 'REVERSAL'/)
  })

  it('is written to the history and tells the owner on their phone, without making the customer wait', () => {
    assert.match(route, /audit\(null, 'order\.customer_cancelled'/)
    assert.match(route, /runInBackground\(sendOrderCancelledPush\(/)
    assert.doesNotMatch(route, /await\s+sendOrderCancelledPush\(/)
  })

  it('the thank-you page and the order page show the box only while it is allowed', () => {
    for (const path of ['app/order/success/page.tsx', 'app/account/orders/[orderNumber]/page.tsx']) {
      const page = read(path)
      assert.match(page, /guestCancelState\(/, path)
      assert.match(page, /<GuestCancelBox /, path)
    }
  })

  it('the owner can switch it off and set the time in Settings', () => {
    assert.match(read('components/settings-center-pro.tsx'), /orders\.guestCancel\.enabled/)
    assert.match(read('components/settings-center-pro.tsx'), /orders\.guestCancel\.minutes/)
    assert.match(read('app/admin/settings/page.tsx'), /orders\.guestCancel\.minutes/)
  })
})
