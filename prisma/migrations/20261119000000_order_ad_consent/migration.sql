-- The shopper's cookie choice at checkout ("granted" or "denied"); Purchase goes to Meta's Conversions API only when granted.
ALTER TABLE "Order" ADD COLUMN "adConsent" TEXT;
