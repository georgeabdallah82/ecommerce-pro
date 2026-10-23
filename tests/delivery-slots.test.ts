import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  DELIVERY_SLOTS_SETTING, MAX_SLOTS, MAX_SLOT_LABEL, NO_SLOTS, SUGGESTED_SLOTS,
  addressWithSlot, normalizeSlots, publicSlots, slotFromAddress, validateSlots,
} from '@/lib/delivery-slots'

const config = { enabled: true, slots: [{ id: 'am', label: 'Morning (9am to 12pm)' }, { id: 'pm', label: 'Evening (4pm to 8pm)' }] }

describe('delivery times: what is stored', () => {
  it('reads nothing, junk or broken text as "no choice offered"', () => {
    for (const raw of [undefined, null, '', 'not json', '[]', 5, { enabled: true }, { enabled: true, slots: [] }, { enabled: true, slots: [{ label: '  ' }] }]) {
      assert.deepEqual(normalizeSlots(raw), NO_SLOTS, JSON.stringify(raw))
    }
  })
  it('reads stored JSON text and gives every time its own id', () => {
    const c = normalizeSlots(JSON.stringify({ enabled: true, slots: [{ label: 'A' }, { id: 's1', label: 'B' }, { id: 's1', label: 'C' }] }))
    assert.equal(c.enabled, true)
    assert.deepEqual(c.slots.map(s => s.label), ['A', 'B', 'C'])
    assert.equal(new Set(c.slots.map(s => s.id)).size, 3)
  })
  it('keeps at most the allowed number of times and trims the words', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `  Time   ${i}  ` }))
    const c = normalizeSlots({ enabled: true, slots: many })
    assert.equal(c.slots.length, MAX_SLOTS)
    assert.equal(c.slots[0].label, 'Time 0')
    assert.equal(normalizeSlots({ enabled: true, slots: [{ label: 'x'.repeat(200) }] }).slots[0].label.length, MAX_SLOT_LABEL)
  })
  it('suggests three times that fit the label limit', () => {
    assert.equal(SUGGESTED_SLOTS.length, 3)
    for (const s of SUGGESTED_SLOTS) assert.ok(s.length <= MAX_SLOT_LABEL, s)
  })
})

describe('delivery times: what the owner types', () => {
  it('accepts a list, dropping empty rows', () => {
    const r = validateSlots({ enabled: true, slots: [{ id: 'a', label: 'Morning' }, { id: 'b', label: '  ' }, { id: 'c', label: 'Evening' }] })
    assert.ok(r.ok && r.value.enabled && r.value.slots.length === 2)
  })
  it('accepts "off" even with an empty list', () => {
    const r = validateSlots({ enabled: false, slots: [] })
    assert.ok(r.ok && !r.value.enabled)
  })
  it('refuses switching on with no times, too many times, and twin names', () => {
    const none = validateSlots({ enabled: true, slots: [] })
    assert.ok(!none.ok && /at least one/.test(none.error))
    const many = validateSlots({ enabled: true, slots: Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({ label: `T${i}` })) })
    assert.ok(!many.ok && /at most/.test(many.error))
    const twin = validateSlots({ enabled: true, slots: [{ label: 'Morning' }, { label: ' morning ' }] })
    assert.ok(!twin.ok && /morning/i.test(twin.error))
  })
  it('treats a non-object body as an empty, switched-off list', () => {
    const r = validateSlots(null)
    assert.ok(r.ok && !r.value.enabled && r.value.slots.length === 0)
  })
})

describe('delivery times: shoppers and the saved address', () => {
  it('offers nothing when switched off', () => {
    assert.deepEqual(publicSlots({ ...config, enabled: false }), [])
    assert.equal(publicSlots(config).length, 2)
  })
  it('saves the words the customer saw, never the id', () => {
    const out = addressWithSlot<Record<string, unknown>>({ city: 'Beirut', deliverySlotId: 'pm' }, config)
    assert.equal(out.deliverySlot, 'Evening (4pm to 8pm)')
    assert.ok(!('deliverySlotId' in out))
    assert.equal(out.city, 'Beirut')
  })
  it('drops an unknown id, an empty id, and any id when switched off', () => {
    for (const [addr, cfg] of [[{ deliverySlotId: 'zz' }, config], [{ deliverySlotId: '' }, config], [{ deliverySlotId: 'am' }, { ...config, enabled: false }]] as const) {
      const out = addressWithSlot({ ...addr }, cfg) as Record<string, unknown>
      assert.ok(!('deliverySlot' in out) && !('deliverySlotId' in out), JSON.stringify(addr))
    }
  })
  it('cannot be tricked into saving words the owner never listed', () => {
    const out = addressWithSlot({ deliverySlot: 'Free gift at the door', deliverySlotId: 'nope' }, config) as Record<string, unknown>
    assert.ok(!('deliverySlot' in out))
  })
  it('reads the time back from an order address', () => {
    assert.equal(slotFromAddress({ deliverySlot: ' Evening ' }), 'Evening')
    assert.equal(slotFromAddress({}), '')
    assert.equal(slotFromAddress(null), '')
    assert.equal(slotFromAddress({ deliverySlot: 7 }), '7')
  })
})

describe('delivery times: wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('is public, validated and applied at checkout', () => {
    assert.match(read('app/api/store/settings/route.ts'), /DELIVERY_SLOTS_SETTING/)
    assert.match(read('app/api/store/settings/route.ts'), /deliverySlots/)
    assert.match(read('lib/validation.ts'), /deliverySlotId: z\.string\(\)\.trim\(\)\.max\(20\)/)
    assert.match(read('app/api/checkout/route.ts'), /addressWithSlot\(input\.shippingAddress/)
    assert.equal(DELIVERY_SLOTS_SETTING, 'delivery.slots')
  })
  it('is saved only by staff who manage shipping, and audited', () => {
    const route = read('app/api/admin/delivery-slots/route.ts')
    assert.match(route, /shipping\.manage/)
    assert.match(route, /audit\(/)
    assert.match(route, /delivery_slots\.updated/)
  })
  it('shows on the order, sheet, driver page, thank-you and account pages', () => {
    for (const p of ['components/order-detail-admin.tsx', 'components/delivery-sheet.tsx', 'components/driver-run.tsx', 'app/order/success/page.tsx', 'app/account/orders/[orderNumber]/page.tsx']) {
      assert.match(read(p), /slot|Slot/, p)
    }
  })
  it('keeps hidden address fields when staff edit an order address', () => {
    assert.match(read('components/order-detail-admin.tsx'), /\.\.\.extra, \.\.\.a/)
  })
})
