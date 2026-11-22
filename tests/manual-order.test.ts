import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { MANUAL_ORDER_SOURCES, deliveryFee, manualOrderMessage } from '@/lib/manual-order'

describe('manual orders (WhatsApp, Instagram, phone, in the shop)', () => {
  it('records where the order came from and who typed it in', () => {
    assert.equal(manualOrderMessage('whatsapp', 'Rana'), 'Order taken on WhatsApp by Rana.')
    assert.equal(manualOrderMessage('instagram', ''), 'Order taken on Instagram.')
    assert.equal(manualOrderMessage('phone', 'Rana'), 'Order taken on a phone call by Rana.')
    assert.equal(manualOrderMessage('in_store', 'Rana'), 'Order taken in the shop by Rana.')
    assert.equal(manualOrderMessage('nonsense', 'Rana'), 'Order added by hand by Rana.')
    assert.deepEqual(MANUAL_ORDER_SOURCES.map(x => x.id), ['whatsapp', 'instagram', 'phone', 'in_store', 'other'])
  })

  it('the delivery fee follows the rate, free above its threshold', () => {
    assert.equal(deliveryFee({ price: 400, freeAbove: 5000 }, 2000), 400)
    assert.equal(deliveryFee({ price: 400, freeAbove: 5000 }, 5000), 0)
    assert.equal(deliveryFee({ price: 400, freeAbove: null }, 99999), 400)
    assert.equal(deliveryFee(null, 1000), 0)
  })

  it('the API needs a name and a phone, not an email', () => {
    const route = readFileSync('app/api/admin/orders/manual/route.ts', 'utf8')
    assert.doesNotMatch(route, /A valid customer email is required/)
    assert.match(route, /if \(!name\) return json/)
    assert.match(route, /if \(!phone\) return json/)
    assert.match(route, /if \(email && !/)
    // No email: no confirmation email, and no lookup of an account by an empty address.
    assert.match(route, /if \(order\.email && /)
    assert.match(route, /email \? await db\.user\.findUnique\(\{ where: \{ email \} \}\) : null/)
    // "Already confirmed" starts the order as Confirmed; nothing past that.
    assert.match(route, /body\.confirmed === true/)
  })

  it('editing an order may clear the email, and nothing is ever emailed to an empty address', () => {
    const route = readFileSync('app/api/admin/orders/route.ts', 'utf8')
    assert.doesNotMatch(route, /if \(!email \|\| !email\.includes\('@'\)\)/)
    const email = readFileSync('lib/email.ts', 'utf8')
    // Nor to the placeholder address of an account made by a WhatsApp sign-in (lib/phone-sign-in.ts).
    assert.match(email, /if \(!to \|\| !to\.includes\('@'\) \|\| \/@phone\\\.invalid\$\/i\.test\(to\.trim\(\)\)\) return \{ sent: false, skipped: true \}/)
  })
})
