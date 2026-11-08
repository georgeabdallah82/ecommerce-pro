import { requirePermission } from '@/lib/auth'
import { createRegister } from '@/lib/pos-registers'
import { tillFailure } from '@/lib/pos-http'
import { json } from '@/lib/utils'

// Add a register at a location. Only people who manage settings can do this.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('settings.manage')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  let body: { name?: unknown; locationId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request could not be read. Try again.' }, { status: 400 })
  }
  try {
    const register = await createRegister({ name: body.name, locationId: body.locationId }, actor.id)
    return json({ id: register.id }, { status: 201 })
  } catch (error) {
    return tillFailure(error, 'register')
  }
}
