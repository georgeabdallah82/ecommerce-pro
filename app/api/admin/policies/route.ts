import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { sanitizeRichHtml } from '@/lib/sanitize-html'
import { POLICY_KINDS, policyKey } from '@/lib/policies'
import type { PolicyKind } from '@/lib/policy-templates'

const noStore = { 'Cache-Control': 'private, no-store' }

async function put(key: string, value: string) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}

// Saves one policy's text (empty = go back to our default wording) and/or the
// "we accept returns" switch. Also moves the policies' "Last updated" date.
export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('content.manage')
    const b = await req.json().catch(() => ({}))
    const changed: string[] = []
    if (b.kind !== undefined) {
      const kind = String(b.kind) as PolicyKind
      if (!POLICY_KINDS.includes(kind)) return json({ error: 'Unknown policy' }, { status: 400, headers: noStore })
      const html = sanitizeRichHtml(String(b.html ?? '')).slice(0, 100_000)
      const empty = !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      await put(policyKey(kind), empty ? '' : html)
      changed.push(kind)
    }
    if (b.returnsEnabled !== undefined) {
      await put('returns.enabled', b.returnsEnabled ? 'true' : 'false')
      changed.push(b.returnsEnabled ? 'returns-on' : 'returns-off')
    }
    if (!changed.length) return json({ error: 'Nothing to save' }, { status: 400, headers: noStore })
    await put('policy.updatedAt', new Date().toISOString())
    await audit(actor.id, 'policies.updated', 'Setting', 'policies', { changed })
    return json({ ok: true }, { headers: noStore })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
    if (message === 'FORBIDDEN') return json({ error: 'You do not have permission to edit policies' }, { status: 403, headers: noStore })
    console.error('[admin/policies] failure', e)
    return json({ error: 'Unable to save the policy' }, { status: 500, headers: noStore })
  }
}
