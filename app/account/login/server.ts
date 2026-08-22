'use server'

import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const password = String(formData.get('password') || '')

  if (!email || !password) redirect('/account/login?error=invalid')

  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD

  if (email === adminEmail && adminPassword && password === adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    const user = await db.user.upsert({
      where: { email: adminEmail },
      update: {
        name: 'Store Admin',
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLoginAt: new Date(),
      },
      create: {
        name: 'Store Admin',
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLoginAt: new Date(),
      },
    })

    await setSession(user.id)
    redirect('/admin')
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    redirect('/account/login?error=invalid')
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  redirect(user.role === 'CUSTOMER' ? '/account' : '/admin')
}
