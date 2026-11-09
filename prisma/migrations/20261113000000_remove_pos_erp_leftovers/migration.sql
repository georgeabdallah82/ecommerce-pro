-- Removes what the ERP and POS work (reverted in the code) left in the database: its tables, the
-- columns it added to existing tables, and its types. Nothing in the current app uses them.
-- Every statement says IF EXISTS, so it does nothing where an object was never created.
-- A copy of the database from before this migration is kept in the backups bucket (30 days).

-- 1. Constraints and indexes on the existing tables that point at the POS tables.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_locationId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_cashierId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_shiftId_fkey";
ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_shiftId_fkey";
ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_cashierId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_supplierId_fkey";
DROP INDEX IF EXISTS "Order_channel_createdAt_idx";
DROP INDEX IF EXISTS "Order_shiftId_idx";
DROP INDEX IF EXISTS "Order_idempotencyKey_key";
DROP INDEX IF EXISTS "ReturnRequest_shiftId_idx";

-- 2. The columns the POS work added to existing tables.
ALTER TABLE "Order"
  DROP COLUMN IF EXISTS "cashierId",
  DROP COLUMN IF EXISTS "channel",
  DROP COLUMN IF EXISTS "exchangeRateLbp",
  DROP COLUMN IF EXISTS "idempotencyKey",
  DROP COLUMN IF EXISTS "locationId",
  DROP COLUMN IF EXISTS "shiftId";
ALTER TABLE "ReturnRequest"
  DROP COLUMN IF EXISTS "cashierId",
  DROP COLUMN IF EXISTS "refundMethod",
  DROP COLUMN IF EXISTS "shiftId";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "supplierId";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "costPrice";

-- 3. The POS tables, the ones that point at each other first.
DROP TABLE IF EXISTS "PaymentLine";
DROP TABLE IF EXISTS "CashMovement";
DROP TABLE IF EXISTS "CashierShift";
DROP TABLE IF EXISTS "Register";
DROP TABLE IF EXISTS "Supplier";

-- 4. The types they used.
DROP TYPE IF EXISTS "OrderChannel";
DROP TYPE IF EXISTS "PaymentLineMethod";
DROP TYPE IF EXISTS "PaymentCurrency";
DROP TYPE IF EXISTS "RegisterStatus";
DROP TYPE IF EXISTS "ShiftStatus";
DROP TYPE IF EXISTS "CashMovementKind";
DROP TYPE IF EXISTS "SupplierStatus";
