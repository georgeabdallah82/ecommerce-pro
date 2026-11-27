import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { alertLockout, recordAppSignIn } from '@/lib/sign-in-alerts'
import { consumeDurableRateLimit, clearDurableRateLimit } from '@/lib/rate-limit'
import { alreadyUsedTotp, matchBackupCode, matchTotp, openSecret } from '@/lib/two-step'
import { cleanInstallId, mobileSessionToken, MOBILE_TOKEN_SECONDS, readMobileTwoStepClaims, ticketSpent } from '@/lib/mobile-auth'
import { getStaffRoles, resolvePermissions } from '@/lib/staff-roles'

const MAX_TRIES = 6
const WINDOW_MS = 15 * 60 * 1000
const headers = { 'Cache-Control': 'no-store' }

// Android admin app sign-in, second step: the 6-digit code from the authenticator app, or a backup
// code, after the password (the ticket from app/api/mobile/v1/auth/login). The same checks as the
// web (app/api/admin/login/code/route.ts), with the same counter (admin-2step:<user>), so a code is
// never accepted twice whether it was typed in a browser or the app. Answers with the app's token.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { ticket?: unknown; code?: unknown; installId?: unknown }
  const code = String(body.code ?? '').trim().slice(0, 40)
  const restart = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your email and password again.', code: 'RESTART' }, { status: 401, headers })

  const ticket = await readMobileTwoStepClaims(body.ticket)
  if (!ticket) return restart()
  const userId = ticket.sub
  const limitKey = `admin-2step:${userId}`
  const limit = await consumeDurableRateLimit(limitKey, MAX_TRIES, WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many wrong codes. Wait 15 minutes and try again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } })
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, isActive: true, staffRoleId: true, avatarUrl: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpBackupCodes: true, lastLoginAt: true } })
  if (!user || !user.isActive || user.role === 'CUSTOMER' || !user.totpEnabledAt || !user.totpSecret) return restart()
  // One session per ticket: a ticket issued before the last sign-in was used already.
  if (ticketSpent(ticket.issuedAtMs, user.lastLoginAt)) return restart()
  const secret = await openSecret(user.totpSecret)
  if (!secret) {
    console.error('[mobile two-step] saved secret could not be read for', user.id)
    return NextResponse.json({ error: 'Your 2-step login can\'t be checked. Use a backup code, or ask the store owner to turn it off for your account.' }, { status: 500, headers })
  }

  let backupLeft: number | null = null
  const step = await matchTotp(secret, code, Date.now(), user.totpLastStep)
  if (step != null) {
    const used = await db.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step, lastLoginAt: new Date() } })
    if (!used.count) return NextResponse.json({ error: 'This code was already used. Wait for the next one in the app.' }, { status: 401, headers })
  } else {
    const hash = await matchBackupCode(code, user.totpBackupCodes)
    if (!hash && await alreadyUsedTotp(secret, code, Date.now(), user.totpLastStep)) return NextResponse.json({ error: 'This code was already used. Wait for the next one in the app.' }, { status: 401, headers })
    if (!hash) {
      if (limit.remaining === 0) await alertLockout(request.headers, user, 'code_lockout')
      return NextResponse.json({ error: 'That code is not right. Check the 6 digits in the app and try again.' }, { status: 401, headers })
    }
    const rest = user.totpBackupCodes.filter(h => h !== hash)
    const used = await db.user.updateMany({ where: { id: user.id, totpBackupCodes: { has: hash } }, data: { totpBackupCodes: { set: rest }, lastLoginAt: new Date() } })
    if (!used.count) return NextResponse.json({ error: 'This backup code was already used.' }, { status: 401, headers })
    backupLeft = rest.length
    await audit(user.id, 'user.two_step_backup_code_used', 'User', user.id, { left: rest.length })
  }

  await clearDurableRateLimit(limitKey)
  const installId = cleanInstallId(body.installId)
  // Remembers the phone as a known device and tells the owner about a new one, like a new browser (lib/sign-in-alerts.ts).
  if (installId) await recordAppSignIn(request.headers, user, installId)
  else await audit(user.id, 'admin.sign_in', 'User', user.id, { device: 'Android app' })
  const token = await mobileSessionToken(user.id)
  const permissions = resolvePermissions(user, user.staffRoleId ? await getStaffRoles() : [])
  return NextResponse.json({
    token,
    expiresAt: new Date(Date.now() + MOBILE_TOKEN_SECONDS * 1000).toISOString(),
    backupLeft,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, permissions },
  }, { headers })
}
