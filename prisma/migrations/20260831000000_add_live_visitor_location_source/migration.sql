ALTER TABLE "LiveVisitorSession"
  ADD COLUMN IF NOT EXISTS "locationSource" TEXT;

CREATE INDEX IF NOT EXISTS "LiveVisitorSession_locationSource_idx"
  ON "LiveVisitorSession"("locationSource");
