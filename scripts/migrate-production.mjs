import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const MIGRATIONS = [
  '20260828000000_add_password_reset_tokens',
  '20260829000000_add_customer_wallet_and_coins',
]

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

async function appliedMigrations() {
  if (!await hasMigrationTable()) return new Set()
  const rows = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations"`
  return new Set(rows.map(row => row.migration_name))
}

async function main() {
  const existing = await appliedMigrations()
  const migrationTableExists = existing.size > 0 || await hasMigrationTable()
  const userTableExists = await tableExists('"User"')
  const passwordResetExists = await tableExists('"PasswordResetToken"')
  const walletExists = await tableExists('"WalletTransaction"')
  const coinsExists = await tableExists('"CoinTransaction"')

  if (!migrationTableExists && userTableExists) {
    // The production database predates Prisma Migrate. Baseline only migrations
    // whose schema changes are already present, then let Migrate apply anything missing.
    if (passwordResetExists) {
      console.log('Baselining existing PasswordResetToken migration')
      prisma(['migrate', 'resolve', '--applied', MIGRATIONS[0], '--schema=prisma'])
    }

    if (walletExists !== coinsExists) {
      throw new Error('Wallet/Coin schema is inconsistent: both WalletTransaction and CoinTransaction must exist together.')
    }

    if (walletExists && coinsExists) {
      console.log('Baselining existing wallet/coin migration')
      prisma(['migrate', 'resolve', '--applied', MIGRATIONS[1], '--schema=prisma'])
    }
  }

  await db.$disconnect()
  prisma(['migrate', 'deploy', '--schema=prisma'])
}

main().catch(async error => {
  console.error('[production-migrations] failed', error)
  await db.$disconnect().catch(() => undefined)
  process.exit(1)
})
