-- Team chat: additive only.
CREATE TABLE "StaffChannel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'team',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffChannel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StaffMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StaffChannelMember" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StaffChannelMember_pkey" PRIMARY KEY ("channelId","userId")
);
CREATE UNIQUE INDEX "StaffChannel_key_key" ON "StaffChannel"("key");
CREATE INDEX "StaffMessage_channelId_createdAt_idx" ON "StaffMessage"("channelId", "createdAt");
CREATE INDEX "StaffMessage_createdAt_idx" ON "StaffMessage"("createdAt");
CREATE INDEX "StaffChannelMember_userId_idx" ON "StaffChannelMember"("userId");
ALTER TABLE "StaffMessage" ADD CONSTRAINT "StaffMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffChannelMember" ADD CONSTRAINT "StaffChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
