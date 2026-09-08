import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'

function createPrisma() {
  return new PrismaClient().$extends(withAccelerate())
}

type EdgePrisma = ReturnType<typeof createPrisma>

const globalForPrisma = globalThis as unknown as {
  prisma?: EdgePrisma
}

const db = globalForPrisma.prisma ?? createPrisma()
globalForPrisma.prisma = db

export { db }
export const prisma = db
export default db
