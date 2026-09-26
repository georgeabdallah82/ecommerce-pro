import { z } from 'zod'

export const emailSchema = z.string().email().max(190)
export const passwordSchema = z.string().min(8).max(72)
export const checkoutSchema = z.object({
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  paymentMethod: z.enum(['COD','CARD','BANK_TRANSFER','WALLET']),
  couponCode: z.string().trim().max(60).optional().or(z.literal('')),
  giftCardCode: z.string().trim().max(60).optional().or(z.literal('')),
  coinsToUse: z.number().int().min(0).max(1000000).default(0),
  shippingRateId: z.string().trim().max(60).optional().or(z.literal('')),
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
  }),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().nullable().optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(100)
})
