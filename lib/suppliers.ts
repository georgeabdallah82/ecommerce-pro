// Products > Suppliers: who you buy from, with their WhatsApp number, so "Send to the supplier"
// on What to reorder opens their chat directly. A supplier is matched to products by the
// product's "Vendor / brand" (capitals and spaces don't matter). Kept as one setting.

import { internationalPhone } from '@/lib/phone'

export const SUPPLIERS_KEY = 'inventory.suppliers'
export const MAX_SUPPLIERS = 300

export type Supplier = { name: string; phone: string; contact: string; note: string }

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
export const supplierKey = (name: string) => text(name, 80).toLowerCase()

// The saved list, cleaned: one entry per name, phone as digits.
export function readSuppliers(value: string | null | undefined): Supplier[] {
  let raw: unknown = []
  try { raw = JSON.parse(value || '[]') } catch { raw = [] }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: Supplier[] = []
  for (const item of raw as Array<Record<string, unknown>>) {
    const name = text(item?.name, 80)
    if (!name || seen.has(supplierKey(name))) continue
    seen.add(supplierKey(name))
    list.push({ name, phone: String(item?.phone ?? '').replace(/\D/g, '').slice(0, 15), contact: text(item?.contact, 60), note: text(item?.note, 200) })
    if (list.length >= MAX_SUPPLIERS) break
  }
  return list
}

// Supplier name (lower case) -> WhatsApp digits, for the ones with a number.
export function supplierPhones(list: Supplier[]) {
  return Object.fromEntries(list.filter(s => s.phone).map(s => [supplierKey(s.name), s.phone]))
}

// Purchase orders name their supplier in free text, so they are matched to suppliers the same
// way products are (capitals and spaces don't matter). Cancelled orders are not counted.
export type PurchaseOrderSummary = { supplierName: string | null; status: string; orderedAt: Date | string | null; createdAt: Date | string }
export type SupplierOrders = { orders: number; open: number; lastOrderedAt: string | null }
const OPEN_ORDER_STATUSES = new Set(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'])

export function ordersBySupplier(orders: PurchaseOrderSummary[]): Record<string, SupplierOrders> {
  const out: Record<string, SupplierOrders> = {}
  for (const order of orders) {
    const name = text(order.supplierName, 80)
    if (!name || order.status === 'CANCELLED') continue
    const key = supplierKey(name)
    const entry = out[key] || { orders: 0, open: 0, lastOrderedAt: null }
    entry.orders += 1
    if (OPEN_ORDER_STATUSES.has(order.status)) entry.open += 1
    const when = new Date(order.orderedAt ?? order.createdAt).toISOString()
    if (!entry.lastOrderedAt || when > entry.lastOrderedAt) entry.lastOrderedAt = when
    out[key] = entry
  }
  return out
}

// Whether "Send to the supplier" can open their WhatsApp chat: a number is missing, or it is
// there but does not read as a complete number for the store's country.
export type SupplierHealth = 'ready' | 'no-number' | 'number-invalid'
export function supplierHealth(phone: string, country: string): SupplierHealth {
  const raw = String(phone || '').trim()
  if (!raw) return 'no-number'
  return internationalPhone(raw, country) ? 'ready' : 'number-invalid'
}
