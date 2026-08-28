import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const MIGRATIONS = {
  passwordReset: '20260828000000_add_password_reset_tokens',
  walletCoins: '20260829000000_add_customer_wallet_and_coins',
}

function prisma(args) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(command, ['prisma', ...args], { stdio: 'inherit', env: process.env })
}

async function tableExists(name) {
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name.replaceAll('"', '')}
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function migrationNames() {
  if (!await tableExists('_prisma_migrations')) return new Set<string>()
  const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT "migration_name" FROM "_prisma_migrations"
  `
  return new Set(rows.map(row => row.migration_name))
}

async function ensureMigrationTable() {
  if (await tableExists('_prisma_migrations')) return
  await db.$executeRawUnsafe(`
    CREATE TABLE "_prisma_migrations" (
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
}

async function markApplied(migrationName) {
  const applied = await migrationNames()
  if (applied.has(migrationName)) return
  await db.$executeRaw`
    INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
    VALUES
      (${randomUUID()}, '', CURRENT_TIMESTAMP, ${migrationName}, CURRENT_TIMESTAMP, 0)
  `
}

async function ensureProductionMigrationHistory() {
  const userExists = await tableExists('User')
  if (!userExists) return

  await ensureMigrationTable()
  const applied = await migrationNames()
  const passwordResetExists = await tableExists('PasswordResetToken')
  const walletExists = await tableExists('WalletTransaction')
  const coinsExists = await tableExists('CoinTransaction')

  if (passwordResetExists && !applied.has(MIGRATIONS.passwordReset)) {
    console.log('Baselining existing PasswordResetToken migration')
    await markApplied(MIGRATIONS.passwordReset)
  }

  if (walletExists !== coinsExists) {
    throw new Error('Wallet/Coin schema is inconsistent: both WalletTransaction and CoinTransaction must exist together.')
  }

  if (walletExists && coinsExists && !applied.has(MIGRATIONS.walletCoins)) {
    console.log('Baselining existing wallet/coin migration')
    await markApplied(MIGRATIONS.walletCoins)
  }
}

async function main() {
  await ensureProductionMigrationHistory()
  await db.$disconnect()
  prisma(['migrate', 'deploy', '--schema=prisma'])
}

main().catch(async error => {
  console.error('[production-migrations] failed', error)
  await db.$disconnect().catch(() => undefined)
  process.exit(1)
})
