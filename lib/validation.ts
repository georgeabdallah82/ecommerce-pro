import { z } from 'zod'

export const emailSchema = z.string().email().max(190)
export const passwordSchema = z.string().min(8).max(72)
export const checkoutSchema = z.object({
  // Optional: many customers in Lebanon order with a phone number only. With no email there is
  // simply no confirmation email; the phone (required for deliveries) is how the store reaches them.
  email: z.union([emailSchema, z.literal('')]).optional().transform(value => (value || '').trim().toLowerCase()),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  paymentMethod: z.enum(['COD','CARD','BANK_TRANSFER','WALLET']),
  couponCode: z.string().trim().max(60).optional().or(z.literal('')),
  giftCardCode: z.string().trim().max(60).optional().or(z.literal('')),
  coinsToUse: z.number().int().min(0).max(1000000).default(0),
  // The total the shopper reviewed (the price summary), in minor units. Checkout refuses to place the
  // order at any other total, so a stale price never turns into a charge the shopper did not see.
  expectedTotal: z.number().int().min(0).max(100000000).optional(),
  shippingRateId: z.string().trim().max(60).optional().or(z.literal('')),
  // "This is a gift" (Settings > Selling tools): the message goes in the parcel.
  isGift: z.boolean().optional().default(false),
  giftMessage: z.string().trim().max(300).optional().or(z.literal('')),
  // firstName/lastName/line1/city are only required for a cart that actually needs physical
  // delivery -- checked in app/api/checkout/route.ts once it knows whether every item's product
  // has requiresShipping: false, since that depends on a DB lookup this schema can't do. country
  // stays required unconditionally: tax/currency zone matching needs it regardless of shipping.
  shippingAddress: z.object({
    firstName: z.string().trim().max(80).optional().or(z.literal('')),
    lastName: z.string().trim().max(80).optional().or(z.literal('')),
    line1: z.string().trim().max(200).optional().or(z.literal('')),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().max(100).optional().or(z.literal('')),
    region: z.string().trim().max(100).optional().or(z.literal('')),
    postalCode: z.string().trim().max(30).optional().or(z.literal('')),
    country: z.string().trim().min(2).max(80),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
    // "Share my exact location" (lib/location-pin.ts): checked and rounded again by the checkout route.
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    locationAccuracy: z.number().finite().min(0).max(100000).optional(),
  }),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().nullable().optional(), quantity: z.number().int().min(1).max(99), bundleId: z.string().max(64).nullable().optional() })).min(1).max(100)
})
