import { db } from '@/lib/prisma'
import { ALL_PERMISSIONS, OWNER_ONLY_PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@/lib/permissions'

// Custom staff roles ("Delivery coordinator", "Warehouse") made in Users & roles. Kept in one
// setting: there are only ever a handful, and it needs no database migration. A staff member
// on a custom role has User.staffRoleId set; their built-in role is then only the fallback
// label (SUPPORT) and grants nothing on its own.
export type StaffRole = { id: string; name: string; description: string; permissions: Permission[] }

const KEY = 'staff.roles'
const VALID = new Set<Permission>(ALL_PERMISSIONS)

export function cleanPermissions(input: unknown): Permission[] {
  const list = Array.isArray(input) ? input.map(String) : []
  return Array.from(new Set(list.filter((p): p is Permission => VALID.has(p as Permission) && !OWNER_ONLY_PERMISSIONS.includes(p as Permission))))
}

export function parseStaffRoles(raw: unknown): StaffRole[] {
  try {
    const list = JSON.parse(String(raw || '[]'))
    if (!Array.isArray(list)) return []
    return list
      .filter(r => r && typeof r.id === 'string' && typeof r.name === 'string')
      .map(r => ({ id: r.id, name: String(r.name).slice(0, 60), description: String(r.description || '').slice(0, 200), permissions: cleanPermissions(r.permissions) }))
  } catch { return [] }
}

export async function getStaffRoles(): Promise<StaffRole[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  return parseStaffRoles(row?.value)
}

export async function saveStaffRoles(roles: StaffRole[]) {
  const value = JSON.stringify(roles)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
}

// What a staff member may do: their custom role's permissions, or their built-in role's.
// A custom role that was deleted leaves them with no access rather than a guess.
export function resolvePermissions(user: { role: keyof typeof ROLE_PERMISSIONS; staffRoleId?: string | null }, roles: StaffRole[]): Permission[] {
  if (user.role === 'CUSTOMER') return []
  if (user.staffRoleId) return roles.find(r => r.id === user.staffRoleId)?.permissions ?? []
  return ROLE_PERMISSIONS[user.role] ?? []
}
