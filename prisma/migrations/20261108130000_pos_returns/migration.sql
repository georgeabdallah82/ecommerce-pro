-- Till returns: record the shift, cashier and refund method on each return (additive only).

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "refundMethod" "PaymentLineMethod",
ADD COLUMN     "shiftId" TEXT;

-- CreateIndex
CREATE INDEX "ReturnRequest_shiftId_idx" ON "ReturnRequest"("shiftId");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashierShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

