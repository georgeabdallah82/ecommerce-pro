import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('admin access and destructive actions', () => {
  it('the admin layout sends customer accounts away, not only anonymous visitors', () => {
    assert.match(readFileSync('app/admin/layout.tsx', 'utf8'), /!user \|\| user\.role === 'CUSTOMER'/)
  })

  it('the order page shows a parcel tracking link only when it is a web address', () => {
    assert.match(readFileSync('components/order-detail-admin.tsx', 'utf8'), /safeHttpUrl\(f\.trackingUrl\) \?/)
  })

  it('the order and parcel routes refuse a tracking link that is not a web address', () => {
    assert.match(readFileSync('app/api/admin/orders/route.ts', 'utf8'), /!safeHttpUrl\(trackingUrl\)\) return json/)
    assert.match(readFileSync('app/api/admin/fulfillments/[id]/route.ts', 'utf8'), /!safeHttpUrl\(b\.trackingUrl\)\) return json/)
  })

  it('the WhatsApp list asks before it removes a number', () => {
    assert.match(readFileSync('components/whatsapp-list.tsx', 'utf8'), /await confirm\(\{ title: `Remove \+\$\{phone\}\?`/)
  })
})
