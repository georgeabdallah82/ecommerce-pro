import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function GET(req: Request) {
  try {
    await requirePermission('customers.view')
    const params = new URL(req.url).searchParams
    const q = params.get('q')?.trim() || ''
    const status = params.get('status') || 'ALL'
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') || 25)))
    const where: any = {
      role: Role.CUSTOMER,
      ...(status === 'ACTIVE' ? { isActive: true } : status === 'DISABLED' ? { isActive: false } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }
    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true, lastLoginAt: true, _count: { select: { orders: true, reviews: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return json({ rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
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
    return json({ error: e instanceof Error ? e.message : 'Unable to create customer' }, { status: 400 })
  }
}
