import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/auth'
import { Role } from '@prisma/client'

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.SUPPORT, Role.EDITOR]

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !user.passwordHash) {
    return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
  }

  if (!STAFF_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Admin access is restricted to staff accounts.' }, { status: 403 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await setSession(user.id)

  return NextResponse.json({ ok: true })
}
