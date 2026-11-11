import { taxableAmountAfterRewards } from '@/lib/discounts'

// What an order costs once the merchandise discounts are known: coins, delivery, tax, then the
// gift card, in the order the store applies them. Checkout (app/api/checkout/route.ts) places the
// order with these figures, and the price summary (app/api/checkout/quote/route.ts) shows them, so
// the total on the Place order button is the total the shopper is charged. Pure: the caller looks
// up the delivery charge and the tax rate and passes them in.

export type ShippingQuote = { total: number; method: string; estimatedDays: number | null }

// The delivery charge for a cart with nothing to deliver (no physical item).
export const NO_SHIPPING: ShippingQuote = { total: 0, method: 'No shipping required', estimatedDays: null }

export type OrderMoneyInput = {
  discountedSubtotal: number // merchandise after coupons, automatic discounts and bundles
  taxableSubtotal: number // taxable merchandise before discounts
  discountTaxable: number // the part of the discounts that comes off the taxable amount
  coinsApplied: number // coins the shopper uses; the caller has checked them against balance and subtotal
  requiresShipping: boolean
  freeShipping: boolean // a FREE_SHIPPING coupon: delivery is free whatever the rate
  shippingFor: (merchandiseAfterCoins: number) => Promise<ShippingQuote>
  taxRatePercent: number
  giftCardBalance: number | null // balance of a valid gift card, or null when none is used
}

export type OrderMoney = {
  coinDiscount: number
  shipping: ShippingQuote
  shippingTotal: number
  freeShippingDiscount: number
  taxTotal: number
  giftCardDiscount: number
  grandTotal: number
}

export async function orderMoney(input: OrderMoneyInput): Promise<OrderMoney> {
  const coinDiscount = Math.min(input.discountedSubtotal, Math.max(0, input.coinsApplied))
  const rewardAdjustedSubtotal = Math.max(0, input.discountedSubtotal - coinDiscount)
  // Delivery is priced on what is left after coins, so coins can take a cart below the free-delivery
  // threshold. The total the shopper sees has to include that charge.
  const shipping = input.requiresShipping ? await input.shippingFor(rewardAdjustedSubtotal) : NO_SHIPPING
  const shippingTotal = input.freeShipping ? 0 : shipping.total
  const freeShippingDiscount = input.freeShipping ? shipping.total : 0
  const taxableAmount = taxableAmountAfterRewards(input.taxableSubtotal, input.discountTaxable, input.discountedSubtotal, coinDiscount)
  const taxTotal = Math.round(taxableAmount * input.taxRatePercent / 100)
  const preGiftCardTotal = Math.max(0, rewardAdjustedSubtotal + shippingTotal + taxTotal)
  // A gift card pays off the final total, after delivery and tax. Coins only ever discount the
  // merchandise, the way a real gift card is applied at the register.
  const giftCardDiscount = input.giftCardBalance && input.giftCardBalance > 0 ? Math.min(input.giftCardBalance, preGiftCardTotal) : 0
  return {
    coinDiscount,
    shipping,
    shippingTotal,
    freeShippingDiscount,
    taxTotal,
    giftCardDiscount,
    grandTotal: Math.max(0, preGiftCardTotal - giftCardDiscount),
  }
}
