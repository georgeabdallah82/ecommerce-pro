-- CreateTable
CREATE TABLE "PhoneReward" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneReward_code_key" ON "PhoneReward"("code");

-- CreateIndex
CREATE INDEX "PhoneReward_createdAt_idx" ON "PhoneReward"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneReward_phone_milestone_key" ON "PhoneReward"("phone", "milestone");

