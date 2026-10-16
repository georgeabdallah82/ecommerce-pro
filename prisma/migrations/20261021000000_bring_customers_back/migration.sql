-- Bring customers back: photos on reviews, product questions and answers, invite-a-friend codes
-- and their thank-you rewards, and when a past customer was last messaged from the Win back list.
-- One new column (empty for every existing review) and four new tables; nothing else changes.

-- AlterTable: up to 3 photos per review
ALTER TABLE "Review" ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: questions asked on product pages
CREATE TABLE "ProductQuestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: each customer's invite code
CREATE TABLE "InviteCode" (
    "code" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable: thank-you codes given to inviters
CREATE TABLE "InviteReward" (
    "orderId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "rewardCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteReward_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable: last WhatsApp message from the Win back list
CREATE TABLE "WinbackContact" (
    "phone" TEXT NOT NULL,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinbackContact_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "ProductQuestion_productId_published_idx" ON "ProductQuestion"("productId", "published");

-- CreateIndex
CREATE INDEX "ProductQuestion_createdAt_idx" ON "ProductQuestion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_phone_key" ON "InviteCode"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "InviteReward_rewardCode_key" ON "InviteReward"("rewardCode");

-- CreateIndex
CREATE INDEX "InviteReward_inviteCode_idx" ON "InviteReward"("inviteCode");

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteReward" ADD CONSTRAINT "InviteReward_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
