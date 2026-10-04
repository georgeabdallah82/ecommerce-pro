import { db } from '@/lib/prisma'
import { runInBackground } from '@/lib/background'

// Writes the admin activity log entry after the response has gone out, so a save doesn't wait
// on one more database round trip (each one is a trip through Prisma Accelerate). Callers still
// `await audit(...)`; it now resolves straight away. A failed log write never fails the save.
export async function audit(actorId: string | null | undefined, action: string, entity: string, entityId?: string, metadata?: unknown) {
  runInBackground(
    db.auditLog.create({ data: { actorId: actorId || null, action, entity, entityId: entityId || null, metadataJson: metadata === undefined ? null : JSON.stringify(metadata) } })
      .catch(error => console.error('[audit] could not record', action, error)),
  )
}
