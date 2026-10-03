import { db } from '@/lib/prisma'
import { requirePermission, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { Role } from '@prisma/client'
import { getStaffRoles } from '@/lib/staff-roles'
import { deleteStaffCascade } from '@/lib/customers'

const staffRoles = new Set<Role>(['ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'])
const safeUserSelect = { id: true, name: true, email: true, phone: true, role: true, staffRoleId: true, isActive: true, createdAt: true, lastLoginAt: true } as const

// A custom role (Users & roles › Roles) is picked as "custom:<id>"; the user then keeps SUPPORT
// as their built-in role, which grants nothing while staffRoleId is set.
async function parseRoleChoice(value: unknown): Promise<{ role: Role; staffRoleId: string | null } | { error: string } | null> {
  if (value === undefined || value === null || value === '') return null
  const v = String(value)
  if (v.startsWith('custom:')) {
    const id = v.slice(7)
    if (!(await getStaffRoles()).some(r => r.id === id)) return { error: 'That role no longer exists' }
    return { role: 'SUPPORT', staffRoleId: id }
  }
  if (!Object.values(Role).includes(v as Role) || v === 'CUSTOMER') return { error: 'Invalid staff role' }
  return { role: v as Role, staffRoleId: null }
}

function sanitizeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return { status: 401, error: 'Unauthorized' }
  if (message === 'FORBIDDEN') return { status: 403, error: 'Forbidden' }
  console.error('[admin/users] unexpected failure', error)
  return { status: 500, error: 'Unable to process user request' }
}

export async function GET() {
  try {
    await requirePermission('users.view')
    const users = await db.user.findMany({
      where: { role: { not: Role.CUSTOMER } },
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    })
    return json(users, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const b = await req.json()
    const targetId = String(b.id || '').trim()
    if (!targetId) return json({ error: 'User id is required' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, staffRoleId: true } })
    if (!target) return json({ error: 'User not found' }, { status: 404 })
    if (target.role === Role.CUSTOMER) return json({ error: 'Customer accounts are managed from Customers' }, { status: 409 })
    const choice = await parseRoleChoice(b.role)
    if (choice && 'error' in choice) return json({ error: choice.error }, { status: 400 })

    if (actor.role !== 'SUPER_ADMIN' && (target.role === 'SUPER_ADMIN' || b.role === 'SUPER_ADMIN')) {
      return json({ error: 'Only the super admin can manage super admin accounts' }, { status: 403 })
    }
    if (actor.id === targetId && b.isActive === false) return json({ error: 'You cannot disable your own account' }, { status: 400 })
    if (actor.id === targetId && b.role && b.role !== 'SUPER_ADMIN') return json({ error: 'You cannot demote your own account' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (choice) { data.role = choice.role; data.staffRoleId = choice.staffRoleId }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)
    if (b.name !== undefined) data.name = String(b.name).trim()
    if (b.phone !== undefined) data.phone = String(b.phone || '').trim() || null
    if (b.password) {
      if (String(b.password).length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      data.passwordHash = await hashPassword(String(b.password))
    }
    if (b.email !== undefined) {
      const email = String(b.email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, { status: 400 })
      const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (taken && taken.id !== targetId) return json({ error: 'Another account already uses this email' }, { status: 409 })
      data.email = email
    }
    const roleChanged = choice && (choice.role !== target.role || choice.staffRoleId !== (target.staffRoleId ?? null))
    if (data.passwordHash || roleChanged || data.isActive === false || data.email) data.sessionsRevokedAt = new Date()
    const u = await db.user.update({ where: { id: targetId }, data, select: safeUserSelect })
    await audit(actor.id, data.passwordHash ? 'user.password_set' : 'user.updated', 'User', u.id, { role: u.role, staffRoleId: u.staffRoleId, isActive: u.isActive })
    return json({ user: u }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const b = await req.json()
    const email = String(b.email || '').trim().toLowerCase()
    const password = String(b.password || '')
    const choice = await parseRoleChoice(b.role || 'SUPPORT')
    if (!choice || 'error' in choice) return json({ error: choice?.error || 'Invalid staff role' }, { status: 400 })
    const requestedRole = choice.role
    if (!email || password.length < 8) return json({ error: 'Valid email and password are required' }, { status: 400 })
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) return json({ error: 'An account with this email already exists' }, { status: 409 })
    if (requestedRole === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return json({ error: 'Only the super admin can create a super admin' }, { status: 403 })
    if (actor.role !== 'SUPER_ADMIN' && !staffRoles.has(requestedRole)) return json({ error: 'You cannot assign this role' }, { status: 403 })
    const u = await db.user.create({ data: { name: String(b.name || 'Staff').trim().slice(0, 120), email, phone: b.phone ? String(b.phone).trim().slice(0, 40) : null, passwordHash: await hashPassword(password), role: requestedRole, staffRoleId: choice.staffRoleId }, select: safeUserSelect })
    await audit(actor.id, 'user.created', 'User', u.id, { role: u.role })
    return json({ user: u }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    return json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const { searchParams } = new URL(req.url)
    const targetId = String(searchParams.get('id') || '').trim()
    if (!targetId) return json({ error: 'User id is required' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } })
    if (!target) return json({ error: 'User not found' }, { status: 404 })
    if (target.role === Role.CUSTOMER) return json({ error: 'Customer accounts are managed from Customers' }, { status: 409 })
    if (target.id === actor.id) return json({ error: 'You cannot delete your own account' }, { status: 400 })
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return json({ error: 'Only the super admin can delete a super admin' }, { status: 403 })
    const full = await db.user.findUnique({ where: { id: targetId }, select: { name: true, email: true } })
    await deleteStaffCascade(db, targetId, actor.id, full?.name || 'a removed staff member')
    await audit(actor.id, 'user.deleted', 'User', target.id, { previousRole: target.role, email: full?.email })
    return json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const failure = sanitizeFailure(e)
    const error = failure.status === 500 ? 'Could not delete this user right now. Please try again, or use Disable to block their access.' : failure.error
    return json({ error }, { status: failure.status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
