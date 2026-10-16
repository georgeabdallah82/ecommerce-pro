-- Unfinished checkouts saved by phone (customers who order with a phone number only), so staff
-- can remind them on WhatsApp (Admin > Orders > Unfinished checkouts). Three new empty columns;
-- nothing existing changes.

-- AlterTable
ALTER TABLE "AbandonedCheckout" ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "whatsappAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AbandonedCheckout_phone_idx" ON "AbandonedCheckout"("phone");
