import { requirePermission, getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import UsersAdminSafe from '@/components/users-admin-safe'

export default async function Users() {
  await requirePermission('users.view')
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    }),
  ])
  return <UsersAdminSafe initial={users.map(user => ({ ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null }))} currentUser={currentUser ? { id: currentUser.id, role: currentUser.role } : null} />
}
