-- Driver links expire (90 days after they were made). Existing links get 90 days from this migration.
-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);

-- Existing links are given an expiry too, so none of them stays valid for good.
UPDATE "Driver" SET "tokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '90 days' WHERE "tokenExpiresAt" IS NULL;
