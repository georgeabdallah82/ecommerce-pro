import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASELINE = '0_legacy_baseline'

function prisma(args) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(command, ['prisma', ...args], { stdio: 'inherit', env: process.env })
}

async function tableExists(name) {
  const rows = await db.$queryRaw`SELECT to_regclass(${`public.${name}`}) AS name`
  return Boolean(rows[0]?.name)
}

async function hasMigrationTable() {
  return tableExists('_prisma_migrations')
}

async function ensureLegacyBaseline() {
  if (await hasMigrationTable()) return
  const userExists = await tableExists('"User"')
  if (!userExists) return

  const migrationSql = await readFile(`prisma/migrations/${BASELINE}/migration.sql`, 'utf8')
  const checksum = createHash('sha256').update(migrationSql).digest('hex')

  console.log('Initializing Prisma migration history for the existing production database')
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" TIMESTAMP(3),
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMP(3),
      "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    )
  `)

  const existing = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${BASELINE}
  `
  if (!existing.length) {
    await db.$executeRaw`
      INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
      VALUES
        (${randomUUID()}, ${checksum}, CURRENT_TIMESTAMP, ${BASELINE}, CURRENT_TIMESTAMP, 1)
    `
  }
}

async function main() {
  await ensureLegacyBaseline()
  await db.$disconnect()
  prisma(['migrate', 'deploy', '--schema=prisma'])
}

main().catch(async error => {
  console.error('[production-migrations] failed', error)
  await db.$disconnect().catch(() => undefined)
  process.exit(1)
})
