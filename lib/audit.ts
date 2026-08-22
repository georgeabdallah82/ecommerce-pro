import { db } from '@/lib/prisma'

export async function audit(actorId: string | null | undefined, action: string, entity: string, entityId?: string, metadata?: unknown) {
  await db.auditLog.create({ data: { actorId: actorId || null, action, entity, entityId: entityId || null, metadataJson: metadata === undefined ? null : JSON.stringify(metadata) } })
}
