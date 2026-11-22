-- Sign in with a WhatsApp code (lib/phone-sign-in.ts, docs/phone-sign-in-2026-11.md): the codes sent, as keyed hashes.
CREATE TABLE "PhoneLoginCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhoneLoginCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PhoneLoginCode_phone_idx" ON "PhoneLoginCode"("phone");
