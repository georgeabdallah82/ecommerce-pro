import { db } from '@/lib/prisma'
import { requireStaff, setSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { getStoreIdentity } from '@/lib/store-identity'
import { json } from '@/lib/utils'
import { alreadyUsedTotp, hashBackupCode, matchBackupCode, matchTotp, newBackupCodes, newSecret, openSecret, otpauthUri, sealSecret } from '@/lib/two-step'

const noStore = { 'Cache-Control': 'private, no-store' }

// Settings > Security & access > 2-step login, for the signed-in staff member's own account
// (lib/two-step.ts). Someone who manages users can turn it off for another person who lost their
// phone (app/api/admin/users/route.ts).
export async function GET() {
  try {
    const user = await requireStaff()
    return json({ enabled: Boolean(user.totpEnabledAt), enabledAt: user.totpEnabledAt, backupLeft: user.totpBackupCodes.length }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load 2-step login') }
}

export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { action?: unknown; code?: unknown }
    const action = String(body.action || '')
    const code = String(body.code ?? '').trim().slice(0, 40)
    const limit = await consumeDurableRateLimit(`two-step-settings:${user.id}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429, headers: noStore })

    if (action === 'start') {
      if (user.totpEnabledAt) return json({ error: '2-step login is already on' }, { status: 400, headers: noStore })
      const secret = newSecret()
      await db.user.update({ where: { id: user.id }, data: { totpSecret: await sealSecret(secret), totpLastStep: null, totpBackupCodes: [] } })
      const issuer = (await getStoreIdentity()).name || 'Store admin'
      return json({ secret, uri: otpauthUri(issuer, user.email, secret), account: user.email, issuer }, { headers: noStore })
    }

    if (action === 'confirm') {
      if (user.totpEnabledAt) return json({ error: '2-step login is already on' }, { status: 400, headers: noStore })
      const secret = await openSecret(user.totpSecret)
      if (!secret) return json({ error: 'Start again: tap "Turn on 2-step login".' }, { status: 400, headers: noStore })
      const step = await matchTotp(secret, code, Date.now(), null)
      if (step == null) return json({ error: 'That code is not right. Type the 6 digits the app shows now.' }, { status: 400, headers: noStore })
      const codes = newBackupCodes()
      // Every other device is signed out; this one gets a fresh session.
      await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpLastStep: step, totpBackupCodes: await Promise.all(codes.map(hashBackupCode)), sessionsRevokedAt: new Date() } })
      await setSession(user.id)
      await audit(user.id, 'user.two_step_on', 'User', user.id)
      return json({ ok: true, backupCodes: codes }, { headers: noStore })
    }

    // Turning it off, or new backup codes: only with a code from the app (or a backup code).
    if (action === 'off' || action === 'backup-codes') {
      if (!user.totpEnabledAt) return json({ error: '2-step login is off' }, { status: 400, headers: noStore })
      if (action === 'off' && user.role !== 'CUSTOMER') return json({ error: '2-step login is required for staff accounts. If you lost your phone, ask the store owner to reset it.' }, { status: 400, headers: noStore })
      const secret = await openSecret(user.totpSecret)
      const step = secret ? await matchTotp(secret, code, Date.now(), user.totpLastStep) : null
      const backup = step == null ? await matchBackupCode(code, user.totpBackupCodes) : ''
      if (step == null && !backup) {
        const used = secret ? await alreadyUsedTotp(secret, code, Date.now(), user.totpLastStep) : false
        return json({ error: used ? 'This code was already used. Wait for the next one in the app.' : 'That code is not right. Type the 6 digits the app shows now.' }, { status: 400, headers: noStore })
      }
      if (action === 'off') {
        await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpBackupCodes: [] } })
        await audit(user.id, 'user.two_step_off', 'User', user.id)
        return json({ ok: true }, { headers: noStore })
      }
      const codes = newBackupCodes()
      await db.user.update({ where: { id: user.id }, data: { totpBackupCodes: await Promise.all(codes.map(hashBackupCode)), ...(step != null ? { totpLastStep: step } : {}) } })
      await audit(user.id, 'user.two_step_backup_codes', 'User', user.id)
      return json({ ok: true, backupCodes: codes }, { headers: noStore })
    }

    return json({ error: 'Unknown action' }, { status: 400, headers: noStore })
  } catch (error) { return routeError(error, 'Unable to change 2-step login') }
}
