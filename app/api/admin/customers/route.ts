import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { Role, OrderStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { deleteCustomerCascade } from '@/lib/customers'

export async function GET(req: Request) {
  try {
    await requirePermission('customers.view')
    const params = new URL(req.url).searchParams
    const q = params.get('q')?.trim() || ''
    const status = params.get('status') || 'ALL'
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') || 25)))
    const searchClause: any = q ? { OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ] } : {}
    const where: any = {
      role: Role.CUSTOMER,
      ...(status === 'ACTIVE' ? { isActive: true } : status === 'DISABLED' ? { isActive: false } : {}),
      ...searchClause,
    }
    // Active/disabled counts match the current search but ignore the status filter itself,
    // so the "Active"/"Disabled" tiles always reflect the true totals a click would land on
    // instead of just whichever page of rows happens to be loaded.
    const [total, active, disabled, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.count({ where: { role: Role.CUSTOMER, isActive: true, ...searchClause } }),
      db.user.count({ where: { role: Role.CUSTOMER, isActive: false, ...searchClause } }),
      db.user.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true, lastLoginAt: true, _count: { select: { orders: true, reviews: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const ids = rows.map(row => row.id)
    const spendRows = (ids.length
      ? await db.order.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: { not: OrderStatus.CANCELLED } }, _sum: { grandTotal: true } })
      : []) as { userId: string | null; _sum: { grandTotal: number | null } }[]
    const spendByCustomer = new Map(spendRows.map(row => [row.userId, row._sum.grandTotal || 0]))
    const hydratedRows = rows.map(row => ({ ...row, totalSpent: spendByCustomer.get(row.id) || 0 }))

    return json({ rows: hydratedRows, total, active, disabled, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  } catch (e) {
    console.error('[admin/customers] GET failed', e)
    return json({ error: 'Unable to load customers' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json()
    if (body.action === 'bulk') {
      const ids: string[] = Array.from(new Set<string>(Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x).trim().slice(0, 100)).filter((x: string) => Boolean(x)) : []))
      if (!ids.length) return json({ error: 'Select at least one customer' }, { status: 400 })
      if (ids.length > 500) return json({ error: 'Too many customers selected' }, { status: 400 })
      const bulkAction = String(body.bulkAction || '')
      if (bulkAction === 'ACTIVATE' || bulkAction === 'DISABLE') {
        const result = await db.user.updateMany({ where: { id: { in: ids }, role: Role.CUSTOMER }, data: { isActive: bulkAction === 'ACTIVATE' } })
        await audit(actor.id, 'customer.bulk_updated', 'User', undefined, { ids, action: bulkAction, count: result.count })
        return json({ ok: true, count: result.count })
      }
      if (bulkAction === 'DELETE') {
        const targets = await db.user.findMany({ where: { id: { in: ids }, role: Role.CUSTOMER }, select: { id: true } })
        await db.$transaction(async tx => { for (const target of targets) await deleteCustomerCascade(tx, target.id) })
        await audit(actor.id, 'customer.bulk_deleted', 'User', undefined, { ids: targets.map(t => t.id), count: targets.length })
        return json({ ok: true, count: targets.length })
      }
      return json({ error: 'Unsupported bulk action' }, { status: 400 })
    }

    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const phone = body.phone ? String(body.phone).trim() : null
    const password = typeof body.password === 'string' ? body.password : ''
    if (!name || !email) return json({ error: 'Name and email are required' }, { status: 400 })
    if (password && password.length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return json({ error: 'A customer with this email already exists' }, { status: 409 })
    const passwordHash = await bcrypt.hash(password || `${crypto.randomUUID()}-${Date.now()}`, 12)
    const customer = await db.user.create({ data: { name, email, phone, passwordHash, role: Role.CUSTOMER, isActive: true } })
    await audit(actor.id, 'customer.created', 'User', customer.id, { email: customer.email })
    return json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, isActive: customer.isActive } }, { status: 201 })
  } catch (e) {
    console.error('[admin/customers] POST failed', e)
    return json({ error: 'Unable to create customer' }, { status: 500 })
  }
}
