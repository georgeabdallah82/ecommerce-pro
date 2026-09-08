import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { db } from '../lib/prisma'

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!password) {
    throw new Error('SEED_ADMIN_PASSWORD must be configured before ensuring the admin account')
  }

  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters long')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.user.upsert({
    where: { email },
    update: {
      name: 'Store Admin',
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name: 'Store Admin',
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  })

  console.log(`Admin account ready: ${email}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
