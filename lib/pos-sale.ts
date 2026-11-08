// Records a till sale. Everything that matters is decided here on the server: prices come from the
// database, stock is checked and moved in the same transaction, and the payment must cover the total.
// The sale is all-or-nothing: if the database cannot run a real transaction, nothing is saved.

import { z } from 'zod'
import { FulfillmentStatus, OrderChannel, OrderStatus, PaymentMethod, PaymentStatus, ShiftStatus } from '@prisma/client'
import { db, runInteractiveTransaction } from '@/lib/prisma'
import { nextOrderNumber } from '@/lib/order-number'
import { fulfillOrderStock, reserveStock } from '@/lib/inventory'
import { audit } from '@/lib/audit'
import { PAYMENT_METHODS, checkPayment, isValidIdempotencyKey, type PaymentMethodCode } from '@/lib/pos-payments'

/** A problem with the sale itself (shown to the cashier). Nothing was saved. */
export class SaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaleError'
  }
}

export const posSaleInput = z.object({
  idempotencyKey: z.string().refine(isValidIdempotencyKey, 'The sale key is not valid. Reload the till and try again.'),
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    variantId: z.string().min(1).max(64).nullable().optional(),
    quantity: z.number().int().min(1).max(999),
  })).min(1, 'Add at least one item.').max(100),
  discountCents: z.number().int().min(0).default(0),
  payments: z.array(z.object({
    method: z.enum(PAYMENT_METHODS),
    currency: z.enum(['USD', 'LBP']),
    amount: z.number().int(),
    reference: z.string().max(64).nullable().optional(),
  })).min(1, 'Add a payment.').max(10),
})

export type PosSaleInput = z.infer<typeof posSaleInput>

export type PosSaleResult = {
  orderId: string
  orderNumber: string
  grandTotalCents: number
  changeUsdCents: number
  replayed: boolean
}

// How the order's payment method is shown in the admin: the largest payment decides.
const ORDER_METHOD: Record<PaymentMethodCode, PaymentMethod> = {
  CASH: PaymentMethod.COD,
  CARD: PaymentMethod.CARD,
  BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
  WHISH: PaymentMethod.WALLET,
  OMT: PaymentMethod.WALLET,
  OTHER: PaymentMethod.BANK_TRANSFER,
}

const LBP_RATE_KEY = 'currency.lbpRate'
const LBP_SHOW_KEY = 'currency.showLbp'

// The driver adapter does not always fill in the error code or the target, so the message is checked too.
function isUniqueViolation(error: unknown, field: string) {
  const e = error as { code?: unknown; message?: unknown; meta?: { target?: unknown } }
  const target = JSON.stringify(e?.meta?.target ?? '')
  const message = String(e?.message ?? '')
  const unique = e?.code === 'P2002' || message.includes('Unique constraint failed')
  return unique && (target.includes(field) || message.includes(field))
}

async function findReplay(idempotencyKey: string): Promise<PosSaleResult | null> {
  const order = await db.order.findUnique({ where: { idempotencyKey }, select: { id: true, orderNumber: true, grandTotal: true, paymentLines: { select: { usdCents: true, method: true, currency: true, amount: true } } } })
  if (!order) return null
  const paid = order.paymentLines.reduce((sum, line) => sum + line.usdCents, 0)
  return { orderId: order.id, orderNumber: order.orderNumber, grandTotalCents: order.grandTotal, changeUsdCents: Math.max(0, paid - order.grandTotal), replayed: true }
}

/**
 * Records one sale for the cashier's open shift. Calling it again with the same idempotency key
 * returns the first sale and changes nothing, so a double tap or a retried request cannot charge
 * twice or take stock twice.
 */
export async function recordPosSale(rawInput: unknown, cashierId: string): Promise<PosSaleResult> {
  const parsed = posSaleInput.safeParse(rawInput)
  if (!parsed.success) throw new SaleError(parsed.error.issues[0]?.message ?? 'The sale is not valid.')
  const input = parsed.data

  const earlier = await findReplay(input.idempotencyKey)
  if (earlier) return earlier

  let result: PosSaleResult
  try {
    result = await runInteractiveTransaction(db, async tx => {
      const shift = await tx.cashierShift.findFirst({ where: { cashierId, status: ShiftStatus.OPEN }, include: { register: true } })
      if (!shift) throw new SaleError('Open a cashier shift before selling.')
      if (shift.register.status !== 'ACTIVE') throw new SaleError('This till is switched off. Ask a manager to turn it on.')

      const settings = await tx.setting.findMany({ where: { key: { in: [LBP_RATE_KEY, LBP_SHOW_KEY] } }, select: { key: true, value: true } })
      const setting = (key: string) => settings.find((row: { key: string }) => row.key === key)?.value ?? ''
      const rate = Math.round(Number(setting(LBP_RATE_KEY).replace(/[^\d.]/g, '')) || 0)
      const lbpOn = setting(LBP_SHOW_KEY) === 'true' && rate > 0

      const productIds = [...new Set(input.items.map(item => item.productId))]
      const products = await tx.product.findMany({ where: { id: { in: productIds } }, include: { variants: true, inventory: true } })
      const byId = new Map<string, (typeof products)[number]>(products.map((product: (typeof products)[number]) => [product.id, product]))

      // Lines carry the price from the database. The browser's prices are never used.
      const lines = input.items.map(item => {
        const product = byId.get(item.productId)
        if (!product || product.status !== 'ACTIVE') throw new SaleError('An item in the cart is no longer for sale. Remove it and try again.')
        const variant = item.variantId ? product.variants.find((v: { id: string }) => v.id === item.variantId) : null
        if (item.variantId && !variant) throw new SaleError(`${product.name}: that option no longer exists.`)
        if (!variant && product.variants.length > 0) throw new SaleError(`${product.name}: choose an option first.`)
        const unitPrice = variant ? variant.price ?? product.basePrice : product.basePrice
        return {
          productId: product.id,
          variantId: variant?.id ?? null,
          name: variant ? `${product.name} · ${variant.name}` : product.name,
          sku: variant ? variant.sku : product.sku,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          // Copied now, so later cost changes never rewrite this sale's profit.
          costPrice: product.costPrice ?? null,
        }
      })

      const subtotal = lines.reduce((sum, line) => sum + line.totalPrice, 0)
      if (input.discountCents > subtotal) throw new SaleError('The discount is more than the sale.')
      const grandTotal = subtotal - input.discountCents

      const payments = input.payments.map(payment => {
        if (payment.currency === 'LBP' && !lbpOn) throw new SaleError('LBP payments are switched off in Settings.')
        return payment
      })
      const check = checkPayment({ totalUsdCents: grandTotal, rateLbp: rate || null, lines: payments })
      if (!check.ok) throw new SaleError(check.errors.join(' '))

      const primary = check.lines.reduce((best, line) => (line.usdCents > best.usdCents ? line : best), check.lines[0])
      const orderNumber = await nextOrderNumber(tx)
      const order = await tx.order.create({
        data: {
          orderNumber,
          email: `pos-${orderNumber.toLowerCase()}@yallahaul.local`,
          subtotal,
          discountTotal: input.discountCents,
          grandTotal,
          currency: 'USD',
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.FULFILLED,
          paymentMethod: ORDER_METHOD[primary.method],
          shippingAddressJson: '{}',
          channel: OrderChannel.POS,
          locationId: shift.register.locationId,
          cashierId,
          shiftId: shift.id,
          idempotencyKey: input.idempotencyKey,
          exchangeRateLbp: check.lines.some(line => line.currency === 'LBP') ? rate : null,
          items: { create: lines },
        },
        select: { id: true, orderNumber: true, grandTotal: true },
      })

      // Stock moves through the same reservation and fulfilment path as an online order, so the
      // ledger shows the sale with its order number. A line without enough stock throws here and
      // the whole sale is rolled back.
      for (const line of lines) {
        const fresh = await tx.product.findUnique({ where: { id: line.productId }, include: { inventory: true } })
        try {
          await reserveStock(tx, fresh, line.variantId, line.quantity, orderNumber)
        } catch (error) {
          // Not enough stock is a normal answer for the cashier, not a server fault.
          const message = error instanceof Error ? error.message : ''
          if (message.startsWith('Not enough stock')) throw new SaleError(`${message}. Reduce the quantity and try again.`)
          throw error
        }
      }
      await fulfillOrderStock(tx, order.id)

      await tx.paymentLine.createMany({
        data: check.lines.map(line => ({
          orderId: order.id,
          method: line.method,
          currency: line.currency,
          amount: line.amount,
          usdCents: line.usdCents,
          fxRateLbp: line.fxRateLbp,
          reference: line.reference ?? null,
        })),
      })

      return { orderId: order.id, orderNumber: order.orderNumber, grandTotalCents: order.grandTotal, changeUsdCents: check.changeUsdCents, replayed: false }
    }, { atomic: true })
  } catch (error) {
    // Two requests with the same key raced: the second one hit the unique key after the first
    // committed. Its own sale was rolled back, so return the sale that was saved.
    if (isUniqueViolation(error, 'idempotencyKey')) {
      const saved = await findReplay(input.idempotencyKey)
      if (saved) return saved
    }
    throw error
  }

  await audit(cashierId, 'pos.sale', 'Order', result.orderId, { orderNumber: result.orderNumber, grandTotalCents: result.grandTotalCents })
  return result
}
