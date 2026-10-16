-- Reviews from a delivered order's review link (app/review/[orderNumber]): customers who
-- ordered without an account can rate what they bought. Existing reviews are not changed; the
-- three new columns start empty for them.

-- AlterTable: the account becomes optional; a review from the link keeps its order and the
-- name the customer gave instead.
ALTER TABLE "Review" ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "orderId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex: one review per product per order. Reviews without an order (all existing ones)
-- are not limited by it.
CREATE UNIQUE INDEX "Review_orderId_productId_key" ON "Review"("orderId", "productId");

-- AddForeignKey: deleting an order keeps its reviews, without the link to it.
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
