'use server'
import { db } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { safeNextPath } from '@/lib/links'
import { runInBackground } from '@/lib/background'
import { sendAlreadyRegisteredEmail, sendEmailVerificationEmail } from '@/lib/email'
import { VERIFY_HOURS, createVerificationToken, siteBase } from '@/lib/email-verification'
import { shopperLang } from '@/lib/message-lang'

// Sign-up never says whether an email already has an account: both cases go to the same "check your
// email" page. The owner of a taken address gets a note; a new address gets a confirmation link. No
// one is signed in here; the account is signed in when its link is opened (app/api/auth/verify-email).
export async function register(f: FormData) {
  const name = String(f.get('name') || '').trim()
  const email = String(f.get('email') || '').toLowerCase().trim()
  const password = String(f.get('password') || '')
  const next = safeNextPath(f.get('next'))
  if (name.length < 2 || !email || password.length<8||password.length>128) redirect(`/account/register?error=invalid${next === '/account' ? '' : `&next=${encodeURIComponent(next)}`}`)

  const h = await headers()
  const ip = clientIp(h)
  const ipLimit = await consumeDurableRateLimit(`register:ip:${ip}`, 30, 60 * 60 * 1000)
  if (!ipLimit.allowed) redirect('/account/check-email?error=rate-limited')

  const base = siteBase(h.get('host'), process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL)
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  // Both emails are in the language of the sign-up page (docs/arabic-messages-2026-11.md).
  const lang = await shopperLang()
  if (existing) {
    runInBackground(sendAlreadyRegisteredEmail(email, `${base}/account/login`, `${base}/account/forgot-password`, lang).catch(error => console.error('[register] already-registered email failed', error)))
    redirect('/account/check-email')
  }

  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } })
  const token = await createVerificationToken(user.id)
  runInBackground(sendEmailVerificationEmail(email, `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`, VERIFY_HOURS, lang).catch(error => console.error('[register] verification email failed', error)))
  runInBackground(dispatchWebhookEvent('customer.created', { id: user.id, name: user.name, email: user.email }).catch(error => console.error('[webhook] customer.created dispatch failed', error)))
  redirect('/account/check-email')
}
