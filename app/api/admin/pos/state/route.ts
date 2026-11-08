import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { currentShift } from '@/lib/pos-shifts'
import { json } from '@/lib/utils'

// What the till needs to start: the cashier's open shift, the registers that can be opened, and the
// LBP settings (whether LBP is on and the rate to use).
export async function GET() {
  let actor
  try {
    actor = await requirePermission('orders.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  const [shift, registers, settings] = await Promise.all([
    currentShift(actor.id),
    db.register.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, location: { select: { name: true } } }, orderBy: { name: 'asc' } }),
    db.setting.findMany({ where: { key: { in: ['currency.lbpRate', 'currency.showLbp'] } }, select: { key: true, value: true } }),
  ])
  const setting = (key: string) => settings.find(row => row.key === key)?.value ?? ''
  const rate = Math.round(Number(setting('currency.lbpRate').replace(/[^\d.]/g, '')) || 0)
  return json({
    cashier: { id: actor.id, name: actor.name },
    shift: shift ? {
      id: shift.id,
      openedAt: shift.openedAt,
      openingCashCents: shift.openingCashCents,
      registerName: shift.register.name,
      locationName: shift.register.location?.name ?? '',
    } : null,
    registers: registers.map(register => ({ id: register.id, name: register.name, locationName: register.location?.name ?? '' })),
    lbp: { enabled: setting('currency.showLbp') === 'true' && rate > 0, rate },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
