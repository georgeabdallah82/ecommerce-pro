-- Live chat: additive only.
ALTER TABLE "AssistantConversation" ADD COLUMN "live" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AssistantConversation" ADD COLUMN "waitingSince" TIMESTAMP(3);
ALTER TABLE "AssistantMessage" ADD COLUMN "author" TEXT;
CREATE INDEX "AssistantConversation_waitingSince_idx" ON "AssistantConversation"("waitingSince");
