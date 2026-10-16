-- Admin 2-step login: four new columns on the user, empty for every existing account, so
-- nobody's sign-in changes until they turn it on themselves. Nothing else changes.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;
