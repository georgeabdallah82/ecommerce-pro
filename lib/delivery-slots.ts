// "When would you like it?" at checkout: the customer may pick a delivery time (Morning, Afternoon,
// Evening...) from the list the owner sets in Admin > Shipping. The choice is saved with the order's
// delivery address (shippingAddressJson, like the location pin) as the words the customer saw, and
// shows on the order, the daily delivery sheet and the driver's page. Choosing is optional.
// The rules that need no database, shared by checkout, the pages, the admin and the tests.

export const DELIVERY_SLOTS_SETTING = 'delivery.slots'
export const MAX_SLOTS = 6
export const MAX_SLOT_LABEL = 40
export const SUGGESTED_SLOTS = ['Morning (9am to 12pm)', 'Afternoon (12pm to 4pm)', 'Evening (4pm to 8pm)'] as const

export type DeliverySlot = { id: string; label: string }
export type DeliverySlotsConfig = { enabled: boolean; slots: DeliverySlot[] }
export const NO_SLOTS: DeliverySlotsConfig = { enabled: false, slots: [] }

const cleanLabel = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SLOT_LABEL)
const cleanId = (value: unknown) => { const id = String(value ?? '').trim().toLowerCase(); return /^[a-z0-9]{1,12}$/.test(id) ? id : '' }

// The list with every time having its own short id (the page sends the id, never the words).
function withIds(list: unknown[]): DeliverySlot[] {
  const out: DeliverySlot[] = []
  const used = new Set<string>()
  for (const item of list) {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const label = cleanLabel(raw.label)
    if (!label) continue
    let id = cleanId(raw.id)
    for (let n = out.length + 1; !id || used.has(id); n++) id = `s${n}`
    used.add(id)
    out.push({ id, label })
  }
  return out.slice(0, MAX_SLOTS)
}

// What is stored, read leniently: anything unusable gives "no choice offered".
export function normalizeSlots(raw: unknown): DeliverySlotsConfig {
  let value: Record<string, unknown> = {}
  try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; if (parsed && typeof parsed === 'object') value = parsed as Record<string, unknown> } catch {}
  const slots = withIds(Array.isArray(value.slots) ? value.slots : [])
  return { enabled: value.enabled === true && slots.length > 0, slots }
}

// What the owner typed, checked. `error` is a plain sentence for the owner.
export function validateSlots(raw: unknown): { ok: true; value: DeliverySlotsConfig } | { ok: false; error: string } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(body.slots) ? body.slots : []
  const typed = list.filter(item => cleanLabel((item as Record<string, unknown> | null)?.label))
  if (typed.length > MAX_SLOTS) return { ok: false, error: `Use at most ${MAX_SLOTS} delivery times.` }
  const slots = withIds(typed)
  const seen = new Set<string>()
  for (const slot of slots) {
    const key = slot.label.toLowerCase()
    if (seen.has(key)) return { ok: false, error: `Two delivery times are both called "${slot.label}". Give each its own name.` }
    seen.add(key)
  }
  const enabled = body.enabled === true
  if (enabled && !slots.length) return { ok: false, error: 'Add at least one delivery time, or switch this off.' }
  return { ok: true, value: { enabled, slots } }
}

// What shoppers are offered: nothing when it is switched off.
export const publicSlots = (config: DeliverySlotsConfig): DeliverySlot[] => (config.enabled ? config.slots : [])

// The address as it is saved with the order: any delivery time the page sent is replaced by the
// words the customer saw (from the owner's list), or removed when it is not one of them or the
// choice is switched off. The id the page sent is never saved.
export function addressWithSlot<T extends Record<string, unknown>>(address: T, config: DeliverySlotsConfig): T {
  const { deliverySlotId, deliverySlot: _slot, ...rest } = address as Record<string, unknown>
  const wanted = cleanId(deliverySlotId)
  const slot = wanted ? publicSlots(config).find(s => s.id === wanted) : undefined
  return (slot ? { ...rest, deliverySlot: slot.label } : rest) as unknown as T
}

// The time the customer chose, saved in an order's delivery address ('' when they did not choose).
export const slotFromAddress = (address: Record<string, unknown> | null | undefined) => cleanLabel(address?.deliverySlot)
