import type { Prisma } from '@prisma/client'
import { addCalendarDays, zonedMidnight } from '@/lib/admin-datetime'

const DAY = /^\d{4}-\d{2}-\d{2}$/

// The activity log's filters, read from the query string. The list and the CSV export both use these,
// so they always show the same rows.
export function activityWhere(searchParams: URLSearchParams, timezone: string): Prisma.AuditLogWhereInput {
  const q = (searchParams.get('q') || '').trim().slice(0, 120)
  const entity = (searchParams.get('entity') || '').trim().slice(0, 80)
  const action = (searchParams.get('action') || '').trim().slice(0, 120)
  // "system" = automatic actions with no staff member; any other value is a staff user's id.
  const actor = (searchParams.get('actor') || '').trim().slice(0, 60)
  const from = (searchParams.get('from') || '').trim()
  const to = (searchParams.get('to') || '').trim()
  // Dates are calendar days in the store's timezone, so "Today" means the store's today.
  const range: { gte?: Date; lt?: Date } = {}
  if (DAY.test(from)) range.gte = zonedMidnight(from, timezone)
  if (DAY.test(to)) range.lt = zonedMidnight(addCalendarDays(to, 1), timezone)

  const where: Prisma.AuditLogWhereInput = {}
  if (entity) where.entity = entity
  if (action) where.action = action
  if (actor === 'system') where.actorId = null
  else if (actor) where.actorId = actor
  if (range.gte || range.lt) where.createdAt = range
  if (q) where.OR = [
    { action: { contains: q, mode: 'insensitive' } },
    { entity: { contains: q, mode: 'insensitive' } },
    { entityId: { contains: q, mode: 'insensitive' } },
    { actor: { is: { email: { contains: q, mode: 'insensitive' } } } },
    { actor: { is: { name: { contains: q, mode: 'insensitive' } } } },
  ]
  return where
}
