import { requirePermission } from '@/lib/auth'
import { setRegisterStatus } from '@/lib/pos-registers'
import { tillFailure } from '@/lib/pos-http'
import { json } from '@/lib/utils'

// Switch a register on or off. A register with an open shift cannot be switched off.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let actor
  try {
    actor = await requirePermission('settings.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  let body: { status?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request could not be read. Try again.' }, { status: 400 })
  }
  try {
    await setRegisterStatus(id, body.status, actor.id)
    return json({ ok: true })
  } catch (error) {
    return tillFailure(error, 'register')
  }
}
