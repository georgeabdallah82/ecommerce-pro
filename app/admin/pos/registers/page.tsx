import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import PosRegistersManager from '@/components/pos-registers-manager'

// Registers (tills) at each location. Managers add them and switch them on or off.
export default async function PosRegistersPage() {
  await requirePermission('settings.manage')
  const [registers, locations, open] = await Promise.all([
    db.register.findMany({ include: { location: { select: { name: true } } }, orderBy: [{ location: { name: 'asc' } }, { name: 'asc' }] }),
    db.storeLocation.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.cashierShift.groupBy({ by: ['registerId'], where: { status: 'OPEN' }, _count: { _all: true } }),
  ])
  const openByRegister = new Map(open.map(row => [row.registerId, row._count._all]))
  return (
    <section style={{ maxWidth: 880, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Registers</h1>
        <p style={{ color: '#5f6673', margin: 0, lineHeight: 1.5 }}>A register is a till at a location. Cashiers open their shift on one of these.</p>
      </header>
      <PosRegistersManager
        registers={registers.map(register => ({ id: register.id, name: register.name, status: register.status, locationName: register.location?.name ?? '', openShifts: openByRegister.get(register.id) ?? 0 }))}
        locations={locations}
      />
    </section>
  )
}
