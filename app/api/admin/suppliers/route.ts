import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'
import { getStoreIdentity } from '@/lib/store-identity'
import { MAX_SUPPLIERS, SUPPLIERS_KEY, readSuppliers, supplierKey } from '@/lib/suppliers'
import { json } from '@/lib/utils'

// Products > Suppliers (lib/suppliers.ts): save the whole list at once.
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('inventory.manage')
    const body = await req.json().catch(() => ({})) as { suppliers?: unknown }
    if (!Array.isArray(body.suppliers)) return json({ error: 'Nothing to save' }, { status: 400 })
    if (body.suppliers.length > MAX_SUPPLIERS) return json({ error: `Up to ${MAX_SUPPLIERS} suppliers` }, { status: 400 })
    const country = (await getStoreIdentity()).country
    const typed = body.suppliers as Array<Record<string, unknown>>
    const names = new Set<string>()
    for (const row of typed) {
      const name = String(row?.name ?? '').trim()
      if (!name) return json({ error: 'Every supplier needs a name' }, { status: 400 })
      if (names.has(supplierKey(name))) return json({ error: `${name} is in the list twice` }, { status: 400 })
      names.add(supplierKey(name))
      const phone = String(row?.phone ?? '').trim()
      if (phone && !internationalPhone(phone, country)) return json({ error: `${name}: this WhatsApp number looks incomplete, e.g. 70 123 456` }, { status: 400 })
    }
    const suppliers = readSuppliers(JSON.stringify(typed.map(row => ({ ...row, phone: row?.phone ? internationalPhone(String(row.phone), country) : '' }))))
    await db.setting.upsert({ where: { key: SUPPLIERS_KEY }, create: { key: SUPPLIERS_KEY, value: JSON.stringify(suppliers) }, update: { value: JSON.stringify(suppliers) } })
    await audit(actor.id, 'suppliers.updated', 'Setting', SUPPLIERS_KEY, { count: suppliers.length })
    return json({ suppliers })
  } catch (error) { return routeError(error, 'Unable to save the suppliers', 400) }
}
