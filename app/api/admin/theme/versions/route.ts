import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('content.view')
    const versions = await db.themeVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
    const authorIds = Array.from(new Set(versions.map((v: { createdBy: string | null }) => v.createdBy).filter(Boolean))) as string[]
    const authors = authorIds.length ? await db.user.findMany({ where: { id: { in: authorIds } } }) : []
    const authorNames = new Map(authors.map((u: { id: string; name?: string | null; email: string }) => [u.id, u.name || u.email]))
    return json({
      versions: versions.map((v: { id: string; createdAt: Date; createdBy: string | null }) => ({
        id: v.id,
        createdAt: v.createdAt,
        createdBy: v.createdBy ? authorNames.get(v.createdBy) || 'Unknown' : null,
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}
