import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

// Throws away the unpublished theme draft. The live store (theme.config, theme.sections,
// navigation.main) is not touched, so visitors keep seeing what was last published.
export async function DELETE() {
  try {
    const actor = await requirePermission('content.manage')
    const result = await db.setting.deleteMany({ where: { key: { in: ['theme.draft', 'theme.draft.sections', 'navigation.draft'] } } })
    if (result.count === 0) return json({ error: 'There are no unpublished theme changes to discard.' }, { status: 409 })
    await audit(actor.id, 'theme.draft.discarded', 'Theme', 'theme.draft', { removed: result.count })
    return json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) { return routeError(e, 'Unable to discard theme draft', 400) }
}
