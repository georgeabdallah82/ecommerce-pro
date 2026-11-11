import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { MAX_CUSTOM_ROLES, cleanPermissions, getStaffRoles, saveStaffRoles, type StaffRole } from '@/lib/staff-roles'
import { capRows } from '@/lib/admin-list'

const noStore = { 'Cache-Control': 'private, no-store' }

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  if (message === 'FORBIDDEN') return json({ error: 'Only the owner can change roles' }, { status: 403, headers: noStore })
  console.error('[admin/roles] unexpected failure', error)
  return json({ error: 'Unable to save the role' }, { status: 500, headers: noStore })
}

function readRole(b: any): { name: string; description: string; permissions: StaffRole['permissions'] } | { error: string } {
  const name = String(b?.name || '').trim().slice(0, 60)
  if (!name) return { error: 'Give the role a name' }
  const permissions = cleanPermissions(b?.permissions)
  if (!permissions.length) return { error: 'Tick at least one thing this role can do' }
  return { name, description: String(b?.description || '').trim().slice(0, 200), permissions }
}

async function withCounts(roles: StaffRole[]) {
  // Counted in the database: the staff list is not loaded just to count it.
  const groups = await db.user.groupBy({ by: ['staffRoleId'], where: { role: { not: 'CUSTOMER' } }, _count: { _all: true } })
  const counts = new Map(groups.map(g => [g.staffRoleId, g._count._all]))
  return roles.map(r => ({ ...r, users: counts.get(r.id) ?? 0 }))
}

export async function GET() {
  try {
    await requirePermission('users.view')
    const { rows, truncated } = capRows(await getStaffRoles(), MAX_CUSTOM_ROLES)
    return json({ roles: await withCounts(rows) }, { headers: { ...noStore, 'X-Truncated': String(truncated) } })
  } catch (e) { return failure(e) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const input = readRole(await req.json().catch(() => ({})))
    if ('error' in input) return json({ error: input.error }, { status: 400, headers: noStore })
    const roles = await getStaffRoles()
    if (roles.length >= MAX_CUSTOM_ROLES) return json({ error: `You can have up to ${MAX_CUSTOM_ROLES} custom roles` }, { status: 400, headers: noStore })
    if (roles.some(r => r.name.toLowerCase() === input.name.toLowerCase())) return json({ error: 'A role with this name already exists' }, { status: 409, headers: noStore })
    const role: StaffRole = { id: `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...input }
    await saveStaffRoles([...roles, role])
    await audit(actor.id, 'role.created', 'Role', role.id, { name: role.name, permissions: role.permissions.length })
    return json({ role }, { status: 201, headers: noStore })
  } catch (e) { return failure(e) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const b = await req.json().catch(() => ({}))
    const roles = await getStaffRoles()
    const existing = roles.find(r => r.id === String(b.id || ''))
    if (!existing) return json({ error: 'Role not found' }, { status: 404, headers: noStore })
    const input = readRole(b)
    if ('error' in input) return json({ error: input.error }, { status: 400, headers: noStore })
    if (roles.some(r => r.id !== existing.id && r.name.toLowerCase() === input.name.toLowerCase())) return json({ error: 'A role with this name already exists' }, { status: 409, headers: noStore })
    const role = { ...existing, ...input }
    await saveStaffRoles(roles.map(r => r.id === role.id ? role : r))
    // Anyone on this role gets the new access straight away; a role that lost access also
    // signs its members out, so nobody keeps a page open with rights they no longer have.
    const removed = existing.permissions.some(p => !role.permissions.includes(p))
    if (removed) await db.user.updateMany({ where: { staffRoleId: role.id }, data: { sessionsRevokedAt: new Date() } })
    await audit(actor.id, 'role.updated', 'Role', role.id, { name: role.name, permissions: role.permissions.length })
    return json({ role }, { headers: noStore })
  } catch (e) { return failure(e) }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('users.manage')
    const id = new URL(req.url).searchParams.get('id') || ''
    const roles = await getStaffRoles()
    const role = roles.find(r => r.id === id)
    if (!role) return json({ error: 'Role not found' }, { status: 404, headers: noStore })
    const members = (await db.user.findMany({ where: { role: { not: 'CUSTOMER' } }, select: { staffRoleId: true } })).filter(u => u.staffRoleId === id).length
    if (members > 0) return json({ error: `${members} staff member${members === 1 ? ' is' : 's are'} on this role. Move them to another role first.` }, { status: 409, headers: noStore })
    await saveStaffRoles(roles.filter(r => r.id !== id))
    await audit(actor.id, 'role.deleted', 'Role', id, { name: role.name })
    return json({ ok: true }, { headers: noStore })
  } catch (e) { return failure(e) }
}
