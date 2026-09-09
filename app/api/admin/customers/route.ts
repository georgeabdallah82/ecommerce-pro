import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { Role, OrderStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
