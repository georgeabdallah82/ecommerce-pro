-- Visitor analytics, rebuilt: one row per visit and one per page viewed, with no IP address and no GPS.
-- The old table only held live visitor statistics (cleared at launch anyway), so it is dropped.
-- DropTable
DROP TABLE "LiveVisitorSession";

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "landingPath" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 1,
    "reached" INTEGER NOT NULL DEFAULT 0,
    "cartItems" INTEGER NOT NULL DEFAULT 0,
    "cartValue" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "referrerHost" TEXT,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "cameBefore" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorPageView" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorPageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorSession_sid_key" ON "VisitorSession"("sid");

-- CreateIndex
CREATE INDEX "VisitorSession_lastSeenAt_idx" ON "VisitorSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "VisitorSession_startedAt_idx" ON "VisitorSession"("startedAt");

-- CreateIndex
CREATE INDEX "VisitorPageView_at_idx" ON "VisitorPageView"("at");

-- CreateIndex
CREATE INDEX "VisitorPageView_path_at_idx" ON "VisitorPageView"("path", "at");

