import { randomBytes } from 'node:crypto'

// GiftCard has no separate redemption ledger (unlike coins/CoinTransaction), so a
// redeemed amount is recorded inline on the checkout PaymentTransaction's rawJson
// (giftCardId/giftCardAmount) and reversed by crediting the balance back and
// clearing those two keys in the same transaction -- making a re-run against the
// same order a no-op instead of double-crediting.

function generateGiftCardCode() {
  return randomBytes(10).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-')
}

// A `Product.giftCard` line item charges the customer like any other product,
// but nothing else about it is special-cased -- selling one has to actually
// mint a redeemable GiftCard, not just take the payment. Called once payment
// is confirmed (from the same place order-confirmation emails go out), so an
// order that never gets paid never issues a card. Idempotent per order item
// via a deterministic id, so re-sending a confirmation email never re-issues.
export async function issueGiftCardsForOrder(db: any, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order || !order.items.length) return []
  const productIds = [...new Set(order.items.map((i: any) => i.productId))]
  const giftProducts = await db.product.findMany({ where: { id: { in: productIds }, giftCard: true }, select: { id: true } })
  const giftProductIds = new Set(giftProducts.map((p: any) => p.id))
  const giftItems = order.items.filter((i: any) => giftProductIds.has(i.productId) && i.totalPrice > 0)
  if (!giftItems.length) return []

  const issued = []
  for (const item of giftItems) {
    const code = generateGiftCardCode()
    const card = await db.giftCard.upsert({
      where: { id: `giftcard-order-${item.id}` },
      create: {
        id: `giftcard-order-${item.id}`,
        code,
        last4: code.replace(/[^A-Z0-9]/g, '').slice(-4),
        customerId: order.userId,
        initialAmount: item.totalPrice,
        balance: item.totalPrice,
        currency: order.currency,
        note: `Issued from order ${order.orderNumber}`,
      },
      update: {},
    })
    issued.push(card)
  }
  return issued
}

export function redeemedGiftCard(paymentTransactions: Array<{ provider: string; rawJson: string | null }>) {
  const checkout = paymentTransactions.find(t => t.provider === 'checkout' && t.rawJson)
  if (!checkout?.rawJson) return null
  try {
    const parsed = JSON.parse(checkout.rawJson) as { giftCardId?: unknown; giftCardAmount?: unknown }
    if (typeof parsed.giftCardId !== 'string' || !Number.isSafeInteger(parsed.giftCardAmount) || Number(parsed.giftCardAmount) <= 0) return null
    return { giftCardId: parsed.giftCardId, giftCardAmount: Number(parsed.giftCardAmount) }
  } catch {
    return null
  }
}

// Gift cards have no scheduled sweep (unlike inventory reservations), so status is
// synced lazily on read: called before every admin list/detail query, this flips any
// ACTIVE card whose expiresAt has passed to EXPIRED so the admin UI doesn't show a
// stale "Active" pill indefinitely. Redemption at checkout stays money-safe regardless,
// since it already checks expiresAt directly rather than relying on this field.
export async function expireGiftCards(db: any) {
  await db.giftCard.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } })
}

export async function restoreGiftCardBalance(tx: any, orderId: string, redeemed: { giftCardId: string; giftCardAmount: number }) {
  await tx.giftCard.update({ where: { id: redeemed.giftCardId }, data: { balance: { increment: redeemed.giftCardAmount } } })
  const checkoutTx = await tx.paymentTransaction.findFirst({ where: { orderId, provider: 'checkout' } })
  if (!checkoutTx?.rawJson) return
  try {
    const parsed = JSON.parse(checkoutTx.rawJson)
    delete parsed.giftCardId
    delete parsed.giftCardAmount
    await tx.paymentTransaction.update({ where: { id: checkoutTx.id }, data: { rawJson: JSON.stringify(parsed) } })
  } catch {
    // rawJson wasn't valid JSON -- nothing to clear, balance is already restored.
  }
}
