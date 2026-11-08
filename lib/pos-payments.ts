// Payment and cash rules for the till. Pure functions, so they can be tested without a database.
// USD amounts are cents. LBP amounts are whole lira. Rates are LBP per 1 USD, saved on every sale.

export const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'WHISH', 'OMT', 'OTHER'] as const
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]
export type Currency = 'USD' | 'LBP'

/** LBP amounts are shown and charged in steps of 1,000 lira, as in lib/selling.ts. */
const LBP_STEP = 1000

export function lbpFromUsdCents(usdCents: number, rate: number): number {
  return Math.round((usdCents * rate) / 100 / LBP_STEP) * LBP_STEP
}

export function usdCentsFromLbp(lbp: number, rate: number): number {
  return Math.round((lbp / rate) * 100)
}

export type PaymentInput = {
  method: PaymentMethodCode
  currency: Currency
  /** USD: cents. LBP: whole lira. */
  amount: number
  reference?: string | null
}

export type PaymentLineValue = PaymentInput & { usdCents: number; fxRateLbp: number | null }

export type PaymentCheck =
  | { ok: true; lines: PaymentLineValue[]; paidUsdCents: number; changeUsdCents: number }
  | { ok: false; errors: string[] }

export const MAX_REFERENCE_LENGTH = 64

/**
 * Checks the payment lines of one sale against its total, in USD cents, and fixes the USD value
 * of each line at the rate used. Rules:
 * - every amount is a positive whole number;
 * - an LBP line needs a rate;
 * - the lines must cover the total;
 * - change (only when cash overpays) is given back, so an overpayment needs a cash line.
 */
export function checkPayment(input: { totalUsdCents: number; rateLbp: number | null; lines: PaymentInput[] }): PaymentCheck {
  const errors: string[] = []
  if (!Number.isInteger(input.totalUsdCents) || input.totalUsdCents < 0) errors.push('The sale total is invalid.')
  if (input.lines.length === 0) errors.push('Add at least one payment.')

  const lines: PaymentLineValue[] = []
  for (const line of input.lines) {
    if (!(PAYMENT_METHODS as readonly string[]).includes(line.method)) {
      errors.push(`Unknown payment method: ${line.method}`)
      continue
    }
    if (!Number.isInteger(line.amount) || line.amount <= 0) {
      errors.push(`A ${line.method} payment must be a positive amount.`)
      continue
    }
    if (line.reference && line.reference.length > MAX_REFERENCE_LENGTH) {
      errors.push(`A payment reference can be at most ${MAX_REFERENCE_LENGTH} characters.`)
      continue
    }
    if (line.currency === 'USD') {
      lines.push({ ...line, usdCents: line.amount, fxRateLbp: null })
    } else {
      if (!input.rateLbp || !Number.isInteger(input.rateLbp) || input.rateLbp <= 0) {
        errors.push('An LBP payment needs the exchange rate set in Settings.')
        continue
      }
      lines.push({ ...line, usdCents: usdCentsFromLbp(line.amount, input.rateLbp), fxRateLbp: input.rateLbp })
    }
  }

  const paidUsdCents = lines.reduce((sum, line) => sum + line.usdCents, 0)
  if (errors.length === 0 && paidUsdCents < input.totalUsdCents) errors.push('The payments do not cover the total.')
  const changeUsdCents = Math.max(0, paidUsdCents - input.totalUsdCents)
  if (errors.length === 0 && changeUsdCents > 0 && !lines.some(line => line.method === 'CASH')) {
    errors.push('Change can only be given back on a cash payment.')
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, lines, paidUsdCents, changeUsdCents }
}

/**
 * The cash that should be in the drawer at closing: the opening float, plus cash sales,
 * plus cash put in, minus change given back and cash taken out. All USD cents.
 */
export function expectedShiftCash(input: { openingCents: number; cashSalesCents: number; changeGivenCents: number; cashInCents: number; cashOutCents: number }) {
  return input.openingCents + input.cashSalesCents - input.changeGivenCents + input.cashInCents - input.cashOutCents
}

/** Counted minus expected. Negative: cash is missing. Positive: there is extra cash. Zero: it matches. */
export function cashDiscrepancy(countedCents: number, expectedCents: number) {
  return countedCents - expectedCents
}

/** A stable key for a sale attempt. The same key on a repeated submit returns the first sale. */
export function isValidIdempotencyKey(key: string) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(key)
}
