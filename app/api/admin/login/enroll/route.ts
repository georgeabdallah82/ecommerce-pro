import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { setSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { recordSignIn } from '@/lib/sign-in-alerts'
import { getStoreIdentity } from '@/lib/store-identity'
import { clearEnrollTicket, hashBackupCode, matchTotp, newBackupCodes, newSecret, openSecret, otpauthUri, readEnrollTicket, sealSecret } from '@/lib/two-step'

// Staff set-up of 2-step login, before any session exists (app/api/admin/login/route.ts sends
// staff here). The set-up ticket cookie says whose account it is; nothing else can reach it.
const headers = { 'Cache-Control': 'no-store' }
const restart = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your email and password again.', restart: true }, { status: 401, headers })

async function pendingStaff() {
  const userId = await readEnrollTicket()
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, totpSecret: true, totpEnabledAt: true },
  })
  if (!user || !user.isActive || user.role === 'CUSTOMER' || user.totpEnabledAt) return null
  return user
}

// The set-up key. A new one is made only the first time; refreshing the page shows the same key.
export async function GET() {
  try {
    const user = await pendingStaff()
    if (!user) return restart()
    let secret = await openSecret(user.totpSecret)
    if (!secret) {
      secret = newSecret()
      await db.user.update({ where: { id: user.id }, data: { totpSecret: await sealSecret(secret), totpLastStep: null, totpBackupCodes: [] } })
    }
    const issuer = (await getStoreIdentity()).name || 'Store admin'
    return NextResponse.json({ secret, uri: otpauthUri(issuer, user.email, secret), account: user.email, issuer }, { headers })
  } catch (error) {
    // Say what failed (in the server log) and answer with a readable message, instead of an empty
    // response that the sign-in screen can only show as "Unable to start 2-step login set-up".
    console.error('[login] 2-step set-up key could not be prepared', error instanceof Error ? `${error.name}: ${error.message}` : error)
    return NextResponse.json({ error: 'The 2-step set-up could not start. Wait a minute and try again. If it keeps happening, ask the store owner.' }, { status: 500, headers })
  }
}

// The first code from the app turns 2-step login on, and only then is the session started.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { code?: unknown }
  const code = String(body.code ?? '').trim().slice(0, 40)
  const user = await pendingStaff()
  if (!user) return restart()
  const limit = await consumeDurableRateLimit(`admin-enroll:${user.id}`, 10, 15 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } })
  }
  const secret = await openSecret(user.totpSecret)
  if (!secret) return restart()
  const step = await matchTotp(secret, code, Date.now(), null)
  if (step == null) return NextResponse.json({ error: 'That code is not right. Type the 6 digits the app shows now.' }, { status: 401, headers })

  const codes = newBackupCodes()
  // Sessions from before 2-step login was required are signed out; this one is new.
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step, totpBackupCodes: await Promise.all(codes.map(hashBackupCode)), sessionsRevokedAt: new Date(), lastLoginAt: new Date() },
  })
  await clearEnrollTicket()
  await setSession(user.id)
  await audit(user.id, 'user.two_step_on', 'User', user.id, { at: 'first_sign_in' })
  await recordSignIn(req.headers, user)
  return NextResponse.json({ ok: true, backupCodes: codes }, { headers })
}
