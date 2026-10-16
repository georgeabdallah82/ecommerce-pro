import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { setSession } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { consumeDurableRateLimit, clearDurableRateLimit } from '@/lib/rate-limit'
import { alreadyUsedTotp, clearTwoStepTicket, matchBackupCode, matchTotp, openSecret, readTwoStepTicket } from '@/lib/two-step'

const MAX_TRIES = 6
const WINDOW_MS = 15 * 60 * 1000

// Admin sign-in, second step (lib/two-step.ts): the 6-digit code from the authenticator app, or
// a backup code. Only after the password was right (the short-lived cookie says whose).
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  const body = await request.json().catch(() => ({})) as { code?: unknown }
  const code = String(body.code ?? '').trim().slice(0, 40)
  const restart = () => NextResponse.json({ error: 'Your sign-in timed out. Enter your email and password again.', restart: true }, { status: 401, headers })

  const userId = await readTwoStepTicket()
  if (!userId) return restart()
  const limitKey = `admin-2step:${userId}`
  const limit = await consumeDurableRateLimit(limitKey, MAX_TRIES, WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many wrong codes. Wait 15 minutes and try again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } })
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpBackupCodes: true } })
  if (!user || !user.isActive || user.role === 'CUSTOMER' || !user.totpEnabledAt || !user.totpSecret) { await clearTwoStepTicket(); return restart() }
  const secret = await openSecret(user.totpSecret)
  if (!secret) {
    console.error('[two-step] saved secret could not be read for', user.id)
    return NextResponse.json({ error: 'Your 2-step login can\'t be checked. Use a backup code, or ask the store owner to turn it off for your account.' }, { status: 500, headers })
  }

  let backupLeft: number | null = null
  const step = await matchTotp(secret, code, Date.now(), user.totpLastStep)
  if (step != null) {
    // Only if no other sign-in used this code (or a later one) in the meantime.
    const used = await db.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step, lastLoginAt: new Date() } })
    if (!used.count) return NextResponse.json({ error: 'This code was already used. Wait for the next one in the app.' }, { status: 401, headers })
  } else {
    const hash = await matchBackupCode(code, user.totpBackupCodes)
    if (!hash && await alreadyUsedTotp(secret, code, Date.now(), user.totpLastStep)) return NextResponse.json({ error: 'This code was already used. Wait for the next one in the app.' }, { status: 401, headers })
    if (!hash) return NextResponse.json({ error: 'That code is not right. Check the 6 digits in the app and try again.' }, { status: 401, headers })
    const rest = user.totpBackupCodes.filter(h => h !== hash)
    const used = await db.user.updateMany({ where: { id: user.id, totpBackupCodes: { has: hash } }, data: { totpBackupCodes: { set: rest }, lastLoginAt: new Date() } })
    if (!used.count) return NextResponse.json({ error: 'This backup code was already used.' }, { status: 401, headers })
    backupLeft = rest.length
    await audit(user.id, 'user.two_step_backup_code_used', 'User', user.id, { left: rest.length })
  }

  await clearDurableRateLimit(limitKey)
  await clearTwoStepTicket()
  await setSession(user.id)
  return NextResponse.json({ ok: true, backupLeft }, { headers })
}
