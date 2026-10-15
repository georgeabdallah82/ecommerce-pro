-- Automatic cart reminder emails: three empty columns on AbandonedCheckout (existing rows keep
-- their data; empty means "not handled yet") and a new opt-out list.

-- AlterTable
ALTER TABLE "AbandonedCheckout" ADD COLUMN     "reminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderNote" TEXT,
ADD COLUMN     "reminderState" TEXT;

-- CreateTable
CREATE TABLE "EmailOptOut" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cart_reminder',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOptOut_email_key" ON "EmailOptOut"("email");
