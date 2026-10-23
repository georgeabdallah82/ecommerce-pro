-- Maps: an approximate place (rounded to ~10 km) for each live visitor, and the town, area and optional exact pin typed or shared at checkout for unfinished checkouts. Only adds columns.
-- AlterTable
ALTER TABLE "AbandonedCheckout" ADD COLUMN     "area" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "pinAccuracy" INTEGER,
ADD COLUMN     "pinLat" DOUBLE PRECISION,
ADD COLUMN     "pinLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "VisitorSession" ADD COLUMN     "placeLat" DOUBLE PRECISION,
ADD COLUMN     "placeLng" DOUBLE PRECISION;

