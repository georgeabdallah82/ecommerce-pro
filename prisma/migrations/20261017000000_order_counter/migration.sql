-- Short order numbers (1001, 1002, ...): one new table holding the running counter. Nothing
-- existing is changed; orders placed before this keep their old numbers.

-- CreateTable
CREATE TABLE "Counter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("name")
);

-- The next order placed gets number 1001 (the app adds 1 before using it).
INSERT INTO "Counter" ("name", "value", "updatedAt") VALUES ('order', 1000, CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
