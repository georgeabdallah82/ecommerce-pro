import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function prisma(args) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(command, ['prisma', ...args], { stdio: 'inherit', env: process.env })
}

async function tableExists(name) {
  const rows = await db.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `
  return Boolean(rows[0]?.exists)
}

async function migrationApplied(name) {
  if (!(await tableExists('_prisma_migrations'))) return false
  const rows = await db.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM "_prisma_migrations"
      WHERE migration_name = ${name}
        AND finished_at IS NOT NULL
    ) AS applied
  `
  return Boolean(rows[0]?.applied)
}

async function ensurePasswordResetTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
    )
  `)
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash")
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId")
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt")
  `)
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey'
      ) THEN
        ALTER TABLE "PasswordResetToken"
          ADD CONSTRAINT "PasswordResetToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `)
}

async function ensureWalletAndCoinsTables() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WalletTransaction" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "type" TEXT NOT NULL,
      "reason" TEXT,
      "referenceId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
    )
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt")
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_currency_idx" ON "WalletTransaction"("userId", "currency")
  `)
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_userId_referenceId_type_key"
    ON "WalletTransaction"("userId", "referenceId", "type")
    WHERE "referenceId" IS NOT NULL
  `)
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_userId_fkey'
      ) THEN
        ALTER TABLE "WalletTransaction"
          ADD CONSTRAINT "WalletTransaction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CoinTransaction" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "type" TEXT NOT NULL,
      "reason" TEXT,
      "referenceId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
    )
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt")
  `)
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CoinTransaction_userId_referenceId_type_key"
    ON "CoinTransaction"("userId", "referenceId", "type")
    WHERE "referenceId" IS NOT NULL
  `)
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CoinTransaction_userId_fkey'
      ) THEN
        ALTER TABLE "CoinTransaction"
          ADD CONSTRAINT "CoinTransaction_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `)
}

async function main() {
  const migrationsTableExists = await tableExists('_prisma_migrations')
  const userTableExists = await tableExists('User')

  if (userTableExists && !migrationsTableExists) {
    console.log('[production-migrations] legacy database detected; ensuring additive production tables directly')
    await ensurePasswordResetTable()
    await ensureWalletAndCoinsTables()
    console.log('[production-migrations] additive production tables are ready')
    return
  }

  // A previous bootstrap may have recorded an additive migration as applied
  // while its tables were not actually present. Repair that state before the
  // normal Prisma migration command runs.
  const passwordResetApplied = await migrationApplied('20260828000000_add_password_reset_tokens')
  const walletCoinsApplied = await migrationApplied('20260829000000_add_customer_wallet_and_coins')

  if (passwordResetApplied && !(await tableExists('PasswordResetToken'))) {
    console.log('[production-migrations] repairing missing PasswordResetToken table')
    await ensurePasswordResetTable()
  }

  if (walletCoinsApplied && (!(await tableExists('WalletTransaction')) || !(await tableExists('CoinTransaction')))) {
    console.log('[production-migrations] repairing missing wallet/coin tables')
    await ensureWalletAndCoinsTables()
  }

  await db.$disconnect()
  prisma(['migrate', 'deploy', '--schema=prisma'])
}

main().catch(async error => {
  console.error('[production-migrations] failed', error)
  await db.$disconnect().catch(() => undefined)
  process.exit(1)
})
