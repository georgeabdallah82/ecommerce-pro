'use server'

import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) redirect('/account/login?error=invalid')

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || user.role !== 'CUSTOMER' || !(await verifyPassword(password, user.passwordHash))) {
    redirect('/account/login?error=invalid')
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  redirect('/account')
}
