-- Influencer codes: two NEW tables (the influencers and the payments made to them). Nothing
-- existing is changed, moved or deleted, so every current order, customer and discount stays as is.

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "phone" TEXT,
    "code" TEXT NOT NULL,
    "customerPercent" INTEGER NOT NULL,
    "commissionPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerPayout" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "InfluencerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_code_key" ON "Influencer"("code");

-- CreateIndex
CREATE INDEX "InfluencerPayout_influencerId_idx" ON "InfluencerPayout"("influencerId");

-- AddForeignKey
ALTER TABLE "InfluencerPayout" ADD CONSTRAINT "InfluencerPayout_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

