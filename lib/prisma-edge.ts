import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = globalThis as unknown as {
  prisma?: any
}

const accelerateUrl = process.env.PRISMA_ACCELERATE_URL || process.env.DATABASE_URL || ''

let db: any

try {
  const client = new PrismaClient({
    accelerateUrl: accelerateUrl || undefined,
  })

  db = accelerateUrl ? client.$extends(withAccelerate()) : client
} catch {
  // Keep module initialization safe during build-time evaluation when no runtime URL exists.
  db = new Proxy({}, {
    get() {
      return async () => {
        throw new Error('Database is not configured. Set PRISMA_ACCELERATE_URL for the Cloudflare runtime.')
      }
    },
  })
}

db = globalForPrisma.prisma || db
globalForPrisma.prisma = db

export const prisma = db
export { db }
export default db
