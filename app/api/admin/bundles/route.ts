import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { getBundleConfig, normalizeBundleConfig, saveBundleConfig } from '@/lib/bundles'

function failure(e: unknown) {
  const message = e instanceof Error ? e.message : ''
  if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
  if (message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
  console.error('[admin/bundles]', e)
  return json({ error: 'Unable to save bundles right now.' }, { status: 500 })
}

export async function GET() {
  try {
    await requirePermission('products.view')
    return json(await getBundleConfig(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return failure(e) }
}

// Saves the switch and the whole bundle list (the admin page edits them together).
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('products.manage')
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400 })
    const config = normalizeBundleConfig(body)
    const incomplete = config.bundles.find(b => b.items.length < 2)
    if (incomplete) return json({ error: `"${incomplete.name}" needs at least two products.` }, { status: 400 })
    const free = config.bundles.find(b => b.price <= 0)
    if (free) return json({ error: `"${free.name}" needs a bundle price.` }, { status: 400 })
    await saveBundleConfig(config)
    await audit(actor.id, 'bundles.updated', 'Setting', 'bundles.config', { enabled: config.enabled, count: config.bundles.length })
    return json(config)
  } catch (e) { return failure(e) }
}
