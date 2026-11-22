-- "Running low?" reminders (lib/refill-reminders.ts, docs/refill-reminders-2026-11.md): the days after which a
-- product's buyers are reminded (empty: never), the reminders sent, and the customers who asked for no more.
ALTER TABLE "Product" ADD COLUMN "refillDays" INTEGER;

CREATE TABLE "RefillReminder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefillReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefillReminder_orderId_productId_key" ON "RefillReminder"("orderId", "productId");
CREATE INDEX "RefillReminder_contact_createdAt_idx" ON "RefillReminder"("contact", "createdAt");

CREATE TABLE "RefillOptOut" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefillOptOut_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefillOptOut_contact_key" ON "RefillOptOut"("contact");
