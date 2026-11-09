-- Status of a wholesale inquiry: NEW until someone handles it (CONTACTED, WON, NOT_A_FIT).
-- AlterTable
ALTER TABLE "WholesaleInquiry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN "handledAt" TIMESTAMP(3);
