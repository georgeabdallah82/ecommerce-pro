CREATE TABLE IF NOT EXISTS "LiveVisitorSession" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "path" TEXT NOT NULL,
  "country" TEXT,
  "city" TEXT,
  "region" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "device" TEXT,
  "browser" TEXT,
  "os" TEXT,
  "referrer" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveVisitorSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LiveVisitorSession_sessionId_key" ON "LiveVisitorSession"("sessionId");
CREATE INDEX IF NOT EXISTS "LiveVisitorSession_lastSeenAt_idx" ON "LiveVisitorSession"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "LiveVisitorSession_userId_idx" ON "LiveVisitorSession"("userId");
