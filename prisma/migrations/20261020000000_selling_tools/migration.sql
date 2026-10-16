-- Selling tools: pre-order products, the gift option at checkout, flash sales, and the WhatsApp
-- numbers collected by the welcome-discount popup. New columns start off (false / empty) for
-- everything that exists; one new table.

-- AlterTable: pre-order (keeps selling when sold out, with a note such as "Ships in 2 weeks")
ALTER TABLE "Product" ADD COLUMN     "preorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preorderNote" TEXT;

-- AlterTable: an automatic discount shown on the store as a flash sale with a countdown
ALTER TABLE "Coupon" ADD COLUMN     "flashSale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: "This is a gift" and its message
ALTER TABLE "Order" ADD COLUMN     "giftMessage" TEXT,
ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WhatsApp numbers from the welcome popup
CREATE TABLE "PhoneSubscriber" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'welcome-popup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneSubscriber_phone_key" ON "PhoneSubscriber"("phone");
