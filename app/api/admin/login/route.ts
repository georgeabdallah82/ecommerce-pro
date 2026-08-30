import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createSession } from '@/lib/auth'

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })

  const role = String(user.role || '').toUpperCase()
  const staff = ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'MANAGER', 'OWNER'].includes(role)
  if (!staff) return NextResponse.json({ error: 'Admin access is restricted to staff accounts.' }, { status: 403 })

  await createSession(user.id)
  return NextResponse.json({ ok: true })
}
