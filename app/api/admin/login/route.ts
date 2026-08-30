import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR'] as const

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').toLowerCase().trim()
  const password = String(form.get('password') || '')
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number]) || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)
  return NextResponse.json({ ok: true })
}
