// Products > Suppliers: who you buy from, with their WhatsApp number, so "Send to the supplier"
// on What to reorder opens their chat directly. A supplier is matched to products by the
// product's "Vendor / brand" (capitals and spaces don't matter). Kept as one setting.

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
