import { db } from '@/lib/prisma'
import { requirePermission, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { Role } from '@prisma/client'

const staffRoles = new Set<Role>(['ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'])

export async function GET() {
  try {
    await requirePermission('users.view')
    return json(await db.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id:true, name:true, email:true, phone:true, role:true, isActive:true, createdAt:true, lastLoginAt:true } }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const b = await req.json()
    const targetId = String(b.id || '')
    if (!targetId) return json({ error: 'User id is required' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id: targetId } })
    if (!target) return json({ error: 'User not found' }, { status: 404 })

    if (actor.role !== 'SUPER_ADMIN' && (target.role === 'SUPER_ADMIN' || b.role === 'SUPER_ADMIN')) {
      return json({ error: 'Only the super admin can manage super admin accounts' }, { status: 403 })
    }
    if (actor.id === targetId && b.isActive === false) return json({ error: 'You cannot disable your own account' }, { status: 400 })
    if (actor.id === targetId && b.role && b.role !== 'SUPER_ADMIN') return json({ error: 'You cannot demote your own account' }, { status: 400 })
    if (b.role && !Object.values(Role).includes(b.role as Role)) return json({ error: 'Invalid role' }, { status: 400 })

    const data: any = {}
    if (b.role) data.role = b.role
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive)
    if (b.name !== undefined) data.name = String(b.name).trim()
    if (b.phone !== undefined) data.phone = String(b.phone || '').trim() || null
    if (b.password) {
      if (String(b.password).length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      data.passwordHash = await hashPassword(String(b.password))
    }
    const u = await db.user.update({ where: { id: targetId }, data })
    await audit(actor.id, 'user.updated', 'User', u.id, { role: u.role, isActive: u.isActive })
    return json({ user: u })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update user' }, { status: 400 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const b = await req.json()
    const email = String(b.email || '').trim().toLowerCase()
    const password = String(b.password || '')
    const requestedRole = (b.role || 'SUPPORT') as Role
    if (!email || password.length < 8) return json({ error: 'Valid email and password are required' }, { status: 400 })
    if (!Object.values(Role).includes(requestedRole) || requestedRole === 'CUSTOMER') return json({ error: 'Invalid staff role' }, { status: 400 })
    if (requestedRole === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return json({ error: 'Only the super admin can create a super admin' }, { status: 403 })
    if (actor.role !== 'SUPER_ADMIN' && !staffRoles.has(requestedRole)) return json({ error: 'You cannot assign this role' }, { status: 403 })
    const u = await db.user.create({ data: { name: String(b.name || 'Staff'), email, passwordHash: await hashPassword(password), role: requestedRole } })
    await audit(actor.id, 'user.created', 'User', u.id, { role: u.role })
    return json({ user: u }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create user' }, { status: 400 }) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const { searchParams } = new URL(req.url)
    const targetId = String(searchParams.get('id') || '')
    if (!targetId) return json({ error: 'User id is required' }, { status: 400 })
    const target = await db.user.findUnique({ where: { id: targetId } })
    if (!target) return json({ error: 'User not found' }, { status: 404 })
    if (target.id === actor.id) return json({ error: 'You cannot delete your own account' }, { status: 400 })
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return json({ error: 'Only the super admin can delete a super admin' }, { status: 403 })
    await db.user.update({ where: { id: targetId }, data: { isActive: false } })
    await audit(actor.id, 'user.deactivated', 'User', target.id, { previousRole: target.role })
    return json({ success: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to remove user' }, { status: 400 }) }
}
