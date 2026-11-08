-- Cost of each sold item, copied at the time of sale (additive only).

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costPrice" INTEGER;

