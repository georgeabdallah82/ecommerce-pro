import { db } from '@/lib/prisma'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { cleanInstallId } from '@/lib/mobile-auth'
import { removeAllDevicesFor, removeDevice } from '@/lib/mobile-devices'

const noStore = { 'Cache-Control': 'private, no-store' }

// Signing out of the Android admin app. The phone stops getting alerts (its device row goes); the
// app forgets its token. With `everywhere`, every session of this account ends -- other phones and
// every browser -- through the same revocation mark the owner's "Sign out everywhere" uses.
export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { installId?: unknown; everywhere?: unknown }
    const installId = cleanInstallId(body.installId)
    if (body.everywhere === true) {
      await db.user.update({ where: { id: user.id }, data: { sessionsRevokedAt: new Date() } })
      await removeAllDevicesFor(user.id)
      await audit(user.id, 'user.sessions_revoked', 'User', user.id, { by: 'self', from: 'android app' })
    } else if (installId) {
      await removeDevice(user.id, installId)
    }
    return json({ ok: true }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to sign out', 400, noStore) }
}
