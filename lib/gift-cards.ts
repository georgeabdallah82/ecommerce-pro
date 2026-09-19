// GiftCard has no separate redemption ledger (unlike coins/CoinTransaction), so a
// redeemed amount is recorded inline on the checkout PaymentTransaction's rawJson
// (giftCardId/giftCardAmount) and reversed by crediting the balance back and
// clearing those two keys in the same transaction -- making a re-run against the
// same order a no-op instead of double-crediting.

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
