import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { requireStaff, verifyPassword } from '@/lib/auth'
import { REAUTH_SECONDS, hasRecentReauth, setReauth } from '@/lib/reauth'
import { audit } from '@/lib/audit'
import { consumeDurableRateLimit, clearDurableRateLimit } from '@/lib/rate-limit'
import { matchBackupCode, matchTotp, openSecret } from '@/lib/two-step'

const MAX_TRIES = 6
const WINDOW_MS = 15 * 60 * 1000
const headers = { 'Cache-Control': 'no-store' }
const signInAgain = () => NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401, headers })

// Is there a recent confirmation? A screen can ask before it starts a sensitive action.
export async function GET() {
  try {
    const user = await requireStaff()
    return NextResponse.json({ recent: await hasRecentReauth(user.id), seconds: REAUTH_SECONDS }, { headers })
  } catch {
    return signInAgain()
  }
}

// Confirms it is the signed-in person, with their password or a 6-digit code from their 2-step app
// (or one of their backup codes). The confirmation lasts a few minutes; after that they confirm again.
export async function POST(request: Request) {
  let user
  try {
    user = await requireStaff()
  } catch {
    return signInAgain()
  }
  const body = await request.json().catch(() => ({})) as { password?: unknown; code?: unknown }
  const limitKey = `reauth:${user.id}`
  const limit = await consumeDurableRateLimit(limitKey, MAX_TRIES, WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } })
  }

  const password = typeof body.password === 'string' ? body.password.slice(0, 128) : ''
  const code = typeof body.code === 'string' ? body.code.trim().slice(0, 40) : ''
  const confirmed = password
    ? await verifyPassword(password, user.passwordHash)
    : code ? await confirmWithCode(user, code) : false
  if (!confirmed) return NextResponse.json({ error: 'That password or code is not right.' }, { status: 401, headers })

  await clearDurableRateLimit(limitKey)
  await setReauth(user.id)
  await audit(user.id, 'user.confirmed_sensitive_action', 'User', user.id, { seconds: REAUTH_SECONDS })
  return NextResponse.json({ ok: true, seconds: REAUTH_SECONDS }, { headers })
}

// The 2-step code or a backup code, checked as the sign-in step checks them (app/api/admin/login/code):
// a code counts once, and a backup code is used up when it works.
async function confirmWithCode(user: { id: string; totpSecret: string | null; totpEnabledAt: Date | null; totpLastStep: number | null; totpBackupCodes: string[] }, code: string) {
  if (!user.totpEnabledAt || !user.totpSecret) return false
  const secret = await openSecret(user.totpSecret)
  if (!secret) return false
  const step = await matchTotp(secret, code, Date.now(), user.totpLastStep)
  if (step != null) {
    const used = await db.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } })
    return used.count === 1
  }
  const hash = await matchBackupCode(code, user.totpBackupCodes)
  if (!hash) return false
  const rest = user.totpBackupCodes.filter(h => h !== hash)
  const used = await db.user.updateMany({ where: { id: user.id, totpBackupCodes: { has: hash } }, data: { totpBackupCodes: { set: rest } } })
  if (used.count === 1) await audit(user.id, 'user.two_step_backup_code_used', 'User', user.id, { left: rest.length, for: 'confirmation' })
  return used.count === 1
}
