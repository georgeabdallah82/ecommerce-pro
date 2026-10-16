import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'
import { readExpenseDate } from '@/lib/expenses'

const MAX_AMOUNT = 1_000_000_00

// Running costs for Reports > Profit (lib/expenses.ts), owner only.
//   POST   {name, amount (cents), monthly, startsOn, endsOn?}  add one
//   PATCH  {id, endsOn}                                         stop a monthly cost after that day
//   DELETE ?id=                                                 remove it (it no longer counts at all)
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const amount = Math.round(Number(body.amount))
    const startsOn = readExpenseDate(body.startsOn)
    const endsOn = body.endsOn ? readExpenseDate(body.endsOn) : null
    if (!name) return json({ error: 'Write what the cost is, e.g. Rent' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return json({ error: 'Enter the amount, like 300 or 25.50' }, { status: 400 })
    if (!startsOn) return json({ error: 'Choose the date' }, { status: 400 })
    if (body.endsOn && (!endsOn || endsOn < startsOn)) return json({ error: 'The end date must be after the start' }, { status: 400 })
    const expense = await db.expense.create({ data: { name, amount, currency: await getStoreCurrency(), monthly: body.monthly !== false, startsOn, endsOn } })
    await audit(actor.id, 'expense.created', 'Expense', expense.id, { name, amount, monthly: expense.monthly })
    return json({ expense }, { status: 201 })
  } catch (e) { return routeError(e, 'Unable to save', 400) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = String(body.id || '')
    const current = id ? await db.expense.findUnique({ where: { id } }) : null
    if (!current) return json({ error: 'Not found' }, { status: 404 })
    const endsOn = body.endsOn ? readExpenseDate(body.endsOn) : null
    if (body.endsOn && (!endsOn || endsOn < current.startsOn)) return json({ error: 'The end date must be after the start' }, { status: 400 })
    const expense = await db.expense.update({ where: { id }, data: { endsOn } })
    await audit(actor.id, 'expense.updated', 'Expense', id, { endsOn: body.endsOn || null })
    return json({ expense })
  } catch (e) { return routeError(e, 'Unable to save', 400) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const id = new URL(req.url).searchParams.get('id') || ''
    const removed = await db.expense.deleteMany({ where: { id } })
    if (!removed.count) return json({ error: 'Not found' }, { status: 404 })
    await audit(actor.id, 'expense.deleted', 'Expense', id, {})
    return json({ ok: true })
  } catch (e) { return routeError(e, 'Unable to delete', 400) }
}
