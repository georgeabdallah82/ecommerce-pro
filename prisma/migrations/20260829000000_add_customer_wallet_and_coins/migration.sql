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
);
CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_currency_idx" ON "WalletTransaction"("userId", "currency");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_userId_referenceId_type_key" ON "WalletTransaction"("userId", "referenceId", "type");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WalletTransaction_userId_fkey'
      AND conrelid = '"WalletTransaction"'::regclass
  ) THEN
    ALTER TABLE "WalletTransaction"
      ADD CONSTRAINT "WalletTransaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CoinTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CoinTransaction_userId_referenceId_type_key" ON "CoinTransaction"("userId", "referenceId", "type");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CoinTransaction_userId_fkey'
      AND conrelid = '"CoinTransaction"'::regclass
  ) THEN
    ALTER TABLE "CoinTransaction"
      ADD CONSTRAINT "CoinTransaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
