// Unfinished checkouts (Admin > Orders > Unfinished): the WhatsApp message staff send a shopper
// who started checkout and left, and how a saved phone number reads to staff.

type Money = (cents: number, currency: string) => string
type CartLine = { name?: unknown; quantity?: unknown; unitPrice?: unknown }

export function cartLines(cartJson: string | null | undefined): Array<{ name: string; quantity: number; unitPrice: number }> {
  let raw: unknown = []
  try { raw = JSON.parse(cartJson || '[]') } catch { raw = [] }
  if (!Array.isArray(raw)) return []
  return raw.map((line: CartLine) => ({
    name: String(line?.name || 'Item').slice(0, 120),
    quantity: Math.max(1, Math.trunc(Number(line?.quantity) || 1)),
    unitPrice: Math.max(0, Number(line?.unitPrice) || 0),
  }))
}

export function unfinishedCheckoutMessage(input: { storeName: string; name?: string | null; cartJson: string; subtotal: number; currency: string; recoveryUrl?: string | null }, money: Money) {
  const lines = cartLines(input.cartJson)
  const firstName = String(input.name || '').trim().split(/\s+/)[0] || ''
  return [
    `Hi${firstName ? ` ${firstName}` : ''}, this is ${input.storeName || 'our store'}. We noticed you didn't finish your order:`,
    ...lines.slice(0, 10).map(line => `• ${line.quantity} × ${line.name}`),
    ...(lines.length > 10 ? [`+ ${lines.length - 10} more`] : []),
    `Total: ${money(input.subtotal, input.currency)} (+ delivery)`,
    '',
    input.recoveryUrl ? `Can we help with anything? You can finish it here: ${input.recoveryUrl}` : 'Can we help with anything?',
    'Or just reply here and we will take your order.',
  ].join('\n')
}

export function whatsappChatLink(phoneDigits: string | null | undefined, message: string) {
  const digits = String(phoneDigits || '').replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : ''
}

// 96170123456 -> "+961 70 123 456"; other numbers as "+<digits>".
export function displayPhone(digits: string | null | undefined) {
  const d = String(digits || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('961') && (d.length === 10 || d.length === 11)) {
    const local = d.slice(3)
    return local.length === 8 ? `+961 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}` : `+961 ${local.slice(0, 1)} ${local.slice(1, 4)} ${local.slice(4)}`
  }
  return `+${d}`
}
