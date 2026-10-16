-- Operations: drivers with their own delivery link and the cash they collect, and the store's
-- own running costs (rent, salaries...) for the profit report. Three new order columns, empty
-- for every existing order, and two new tables; nothing else changes.

-- AlterTable: the order's driver, the cash they collected, and when they handed it over
ALTER TABLE "Order" ADD COLUMN     "cashCollected" INTEGER,
ADD COLUMN     "cashSettledAt" TIMESTAMP(3),
ADD COLUMN     "driverId" TEXT;

-- CreateTable: drivers
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable: running costs for the profit report
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly" BOOLEAN NOT NULL DEFAULT true,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_driverId_idx" ON "Order"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_token_key" ON "Driver"("token");

-- CreateIndex
CREATE INDEX "Expense_startsOn_idx" ON "Expense"("startsOn");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
