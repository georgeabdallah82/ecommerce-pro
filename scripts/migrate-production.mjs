import { execFileSync } from 'node:child_process'
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
  const rows = await db.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass(${`public.${name.replaceAll('"', '')}`})::text AS name
  `
  return Boolean(rows[0]?.name)
}

async function migrationNames() {
  if (!await tableExists('_prisma_migrations')) return new Set<string>()
  const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT "migration_name" FROM "_prisma_migrations"
  `
  return new Set(rows.map(row => row.migration_name))
}

async function ensureProductionMigrationHistory() {
  const applied = await migrationNames()
  const userExists = await tableExists('User')
  if (!userExists) return

  const passwordResetExists = await tableExists('PasswordResetToken')
  const walletExists = await tableExists('WalletTransaction')
  const coinsExists = await tableExists('CoinTransaction')

  if (passwordResetExists && !applied.has(MIGRATIONS.passwordReset)) {
    console.log('Baselining existing PasswordResetToken migration')
    prisma(['migrate', 'resolve', '--applied', MIGRATIONS.passwordReset, '--schema=prisma'])
    applied.add(MIGRATIONS.passwordReset)
  }

  if (walletExists !== coinsExists) {
    throw new Error('Wallet/Coin schema is inconsistent: both WalletTransaction and CoinTransaction must exist together.')
  }

  if (walletExists && coinsExists && !applied.has(MIGRATIONS.walletCoins)) {
    console.log('Baselining existing wallet/coin migration')
    prisma(['migrate', 'resolve', '--applied', MIGRATIONS.walletCoins, '--schema=prisma'])
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
