-- The language the shopper used ("en" or "ar"), so the emails and WhatsApp messages about it are written in that
-- language (lib/message-lang.ts, docs/arabic-messages-2026-11.md). Rows from before have none: they get the
-- customer's language from an earlier order, else the store's default language.
ALTER TABLE "Order" ADD COLUMN "lang" TEXT;
ALTER TABLE "AbandonedCheckout" ADD COLUMN "lang" TEXT;
ALTER TABLE "BackInStockRequest" ADD COLUMN "lang" TEXT;
