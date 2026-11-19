-- "Send my order updates on WhatsApp" ticked at checkout (lib/whatsapp-cloud.ts). Existing orders were placed without the choice: false.
ALTER TABLE "Order" ADD COLUMN "whatsappUpdates" BOOLEAN NOT NULL DEFAULT false;
