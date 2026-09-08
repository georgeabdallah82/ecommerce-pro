'use server'

import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) redirect('/account/login?error=invalid')

  const ip = clientIp(await headers())
  const ipKey = `login:ip:${ip}`
  const emailKey = `login:email:${email}`
  const ipLimit = consumeRateLimit(ipKey, 30, 15 * 60 * 1000)
  const emailLimit = consumeRateLimit(emailKey, 10, 15 * 60 * 1000)
  if (!ipLimit.allowed || !emailLimit.allowed) redirect('/account/login?error=rate-limited')

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || user.role !== 'CUSTOMER' || !(await verifyPassword(password, user.passwordHash))) {
    redirect('/account/login?error=invalid')
  }

  clearRateLimit(emailKey)
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  redirect('/account')
}
