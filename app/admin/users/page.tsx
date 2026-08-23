import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { UsersAdmin } from '@/components/users-admin'

export default async function Users() {
  await requirePermission('users.view')
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  })
  return <UsersAdmin initial={users.map(user => ({ ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null }))} />
}
