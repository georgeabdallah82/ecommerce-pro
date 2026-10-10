-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");


-- Move the customer devices saved so far (Account > Notifications kept them as Setting rows,
-- key "push.customer.subscription.<endpoint>", value {"userId","endpoint","keys":{...}}) into
-- the new table. Rows that aren't valid JSON or lack a field are skipped; staff order-alert
-- devices ("push.subscription.") stay where they are.
INSERT INTO "PushSubscription" ("id", "endpoint", "p256dh", "auth", "userId", "createdAt", "updatedAt")
SELECT "id", "value"::jsonb->>'endpoint', "value"::jsonb->'keys'->>'p256dh', "value"::jsonb->'keys'->>'auth', NULLIF("value"::jsonb->>'userId', ''), "updatedAt", "updatedAt"
FROM "Setting"
WHERE "key" LIKE 'push.customer.subscription.%'
  AND pg_input_is_valid("value", 'jsonb')
  AND jsonb_typeof("value"::jsonb) = 'object'
  AND COALESCE("value"::jsonb->>'endpoint', '') <> ''
  AND COALESCE("value"::jsonb->'keys'->>'p256dh', '') <> ''
  AND COALESCE("value"::jsonb->'keys'->>'auth', '') <> ''
ON CONFLICT ("endpoint") DO NOTHING;

DELETE FROM "Setting" WHERE "key" LIKE 'push.customer.subscription.%';
