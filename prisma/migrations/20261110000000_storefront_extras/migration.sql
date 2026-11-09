-- Search analytics (Admin > Analytics > Searches): what shoppers search for and how many results they got.
-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchQuery_createdAt_idx" ON "SearchQuery"("createdAt");

-- Wholesale and bulk-order inquiries from the /wholesale form (Admin > Customers > Wholesale inquiries).
-- CreateTable
CREATE TABLE "WholesaleInquiry" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "interest" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WholesaleInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WholesaleInquiry_createdAt_idx" ON "WholesaleInquiry"("createdAt");

-- Product size guide: plain text lines, one size per line, cells separated by "|" (shown as a table).
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sizeGuide" TEXT;
