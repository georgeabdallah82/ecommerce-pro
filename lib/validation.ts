import { z } from 'zod'

export const emailSchema = z.string().email().max(190)
export const passwordSchema = z.string().min(8).max(72)
export const checkoutSchema = z.object({
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  paymentMethod: z.enum(['COD','CARD','BANK_TRANSFER','WALLET']),
  couponCode: z.string().trim().max(60).optional().or(z.literal('')),
  shippingAddress: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().max(100).optional().or(z.literal('')),
    postalCode: z.string().trim().max(30).optional().or(z.literal('')),
    country: z.string().trim().min(2).max(80),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
  }),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().nullable().optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(100)
})
