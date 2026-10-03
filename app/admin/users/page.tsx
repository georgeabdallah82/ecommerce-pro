import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { Role } from '@prisma/client'
import { hasPermission } from '@/lib/permissions'
import { getStaffRoles } from '@/lib/staff-roles'
import UsersRolesAdmin from '@/components/users-roles-admin'

export default async function Users() {
  const currentUser = await requirePermission('users.view')
  const [users, roles] = await Promise.all([
    db.user.findMany({
      where: { role: { not: Role.CUSTOMER } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, phone: true, role: true, staffRoleId: true, isActive: true, lastLoginAt: true },
    }),
    getStaffRoles(),
  ])
  const canManage = hasPermission(currentUser, 'users.manage')
  const rows = users.map(user => ({ ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null }))
  const rolesWithCounts = roles.map(r => ({ ...r, users: users.filter(u => u.staffRoleId === r.id).length }))
  return <UsersRolesAdmin initialUsers={rows} initialRoles={rolesWithCounts} currentUser={{ id: currentUser.id, role: currentUser.role }} canManage={canManage} />
}
