import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { CUSTOMER_STEP_LABELS, customerTimeline } from '@/lib/order-timeline'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 18, 10, minutes))
const ev = (status: string, minutes: number, message = '') => ({ id: `${status}${minutes}`, status, message, createdAt: at(minutes) })

describe('the customer\'s order history', () => {
  it('shows only the steps, in the shop\'s plain words', () => {
    const steps = customerTimeline([ev('PENDING', 0), ev('CONFIRMED', 5), ev('PROCESSING', 10), ev('SHIPPED', 20), ev('DELIVERED', 30)])
    assert.deepEqual(steps.map(s => s.label), ['Order placed', 'Confirmed', 'Preparing', 'Out for delivery', 'Delivered'])
  })

  it('never shows staff notes: each step once, whatever notes were written while the order was in it', () => {
    const steps = customerTimeline([
      ev('PENDING', 0, 'Order placed.'),
      ev('PENDING', 3, 'WhatsApp: Customer confirmed the order on WhatsApp. (recorded by Store Admin)'),
      ev('PENDING', 4, 'WhatsApp: WhatsApp number is wrong or not on WhatsApp. (recorded by Store Admin)'),
      ev('PENDING', 5, 'WhatsApp: Customer asked on WhatsApp to cancel. (recorded by Store Admin)'),
      ev('CONFIRMED', 8, 'Confirmed by Sami'),
    ])
    assert.deepEqual(steps.map(s => s.status), ['PENDING', 'CONFIRMED'])
    assert.doesNotMatch(JSON.stringify(steps), /WhatsApp|recorded by|Store Admin|Sami/)
    assert.equal(steps[0].createdAt.getTime(), at(0).getTime()) // the first time it reached that step
  })

  it('puts the steps in time order even when they are loaded in another order', () => {
    const steps = customerTimeline([ev('DELIVERED', 30), ev('PENDING', 0), ev('SHIPPED', 20), ev('CONFIRMED', 5)])
    assert.deepEqual(steps.map(s => s.status), ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'])
  })

  it('leaves out anything that is not a step', () => {
    assert.deepEqual(customerTimeline([ev('NOTE', 1, 'internal'), ev('PENDING', 0)]).map(s => s.status), ['PENDING'])
    assert.deepEqual(customerTimeline([]), [])
  })

  it('a cancelled order says Cancelled, without the reason staff wrote', () => {
    const steps = customerTimeline([ev('PENDING', 0), ev('CANCELLED', 9, 'Cancelled: customer unreachable, refused twice')])
    assert.deepEqual(steps.map(s => s.label), ['Order placed', 'Cancelled'])
    assert.doesNotMatch(JSON.stringify(steps), /unreachable|refused/)
  })

  it('every step has an Arabic entry', () => {
    const ar = readFileSync('lib/i18n-ar.ts', 'utf8')
    for (const label of new Set(Object.values(CUSTOMER_STEP_LABELS))) assert.ok(ar.includes(`"${label}":`), label)
  })

  it('the order page uses it, and never loads or prints the staff messages', () => {
    const page = readFileSync('app/account/orders/[orderNumber]/page.tsx', 'utf8')
    assert.match(page, /customerTimeline\(order\.events\)/)
    assert.doesNotMatch(page, /e\.message|message:true/)
  })
})
