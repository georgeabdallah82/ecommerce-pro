import { requirePermission, getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { Role } from '@prisma/client'
import { hasPermission } from '@/lib/permissions'
import UsersAdminSafe from '@/components/users-admin-safe'

export default async function Users() {
  await requirePermission('users.view')
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    db.user.findMany({
      where: { role: { not: Role.CUSTOMER } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    }),
  ])
  const canManage = currentUser ? hasPermission(currentUser.role, 'users.manage') : false
  return <UsersAdminSafe initial={users.map(user => ({ ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null }))} currentUser={currentUser ? { id: currentUser.id, role: currentUser.role } : null} canManage={canManage} />
}
