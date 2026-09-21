import { db } from '@/lib/prisma'
import { issueGiftCardsForOrder } from '@/lib/gift-cards'

function credentials() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return null
  return { apiKey, from }
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
}

function brandName() {
  return process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Brand'
}

function money(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toFixed(2)}`
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function layout(bodyHtml: string) {
  const url = siteUrl()
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4efe9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#242219">
<table role="presentation" width="100%" style="padding:32px 0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:92%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#242219;padding:24px 32px"><span style="color:#faf9f6;font-size:15px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(brandName())}</span></td></tr>
<tr><td style="padding:32px">${bodyHtml}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eee;font-size:12px;color:#8a8578">${escapeHtml(brandName())}${url ? ` &middot; <a href="${url}" style="color:#8a8578">${url.replace(/^https?:\/\//, '')}</a>` : ''}</td></tr>
</table></td></tr></table>
</body></html>`
}

async function settingEnabled(key: string) {
  const setting = await db.setting.findUnique({ where: { key } })
  return setting?.value !== 'false'
}

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const config = credentials()
  if (!config) {
    console.warn('[email] RESEND_API_KEY/EMAIL_FROM not configured; skipping send', { to, subject })
    return { sent: false, skipped: true }
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ from: config.from, to, subject, html, text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      console.error('[email] send rejected', response.status, await response.text().catch(() => ''))
      return { sent: false, skipped: false }
    }
    return { sent: true, skipped: false }
  } catch (error) {
    console.error('[email] send failed', error)
    return { sent: false, skipped: false }
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, expiresInMinutes: number) {
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#4a473d">We received a request to reset the password for this account. This link expires in ${expiresInMinutes} minutes.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">Reset password</a></p>
    <p style="font-size:12px;color:#8a8578">If you didn't request this, you can safely ignore this email.</p>
  `)
  const text = `Reset your password: ${resetUrl} (expires in ${expiresInMinutes} minutes). If you didn't request this, ignore this email.`
  return sendEmail(to, 'Reset your password', html, text)
}

export async function sendOrderConfirmationEmail(orderId: string) {
  if (!(await settingEnabled('email.customerOrder'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return { sent: false, skipped: true }

  const issuedGiftCards = await issueGiftCardsForOrder(db, orderId)

  const url = siteUrl() ? `${siteUrl()}/account/orders/${order.orderNumber}` : null
  const rows = order.items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#242219">${escapeHtml(item.name)} <span style="color:#8a8578">&times; ${item.quantity}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#242219">${money(item.totalPrice, order.currency)}</td>
    </tr>`
    )
    .join('')
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Thanks for your order</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">Order ${escapeHtml(order.orderNumber)}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:13px;color:#8a8578">Subtotal</td><td style="padding-top:12px;text-align:right;font-size:13px">${money(order.subtotal, order.currency)}</td></tr>
      ${order.discountTotal ? `<tr><td style="font-size:13px;color:#8a8578">Discount</td><td style="text-align:right;font-size:13px">-${money(order.discountTotal, order.currency)}</td></tr>` : ''}
      <tr><td style="font-size:13px;color:#8a8578">Shipping</td><td style="text-align:right;font-size:13px">${money(order.shippingTotal, order.currency)}</td></tr>
      <tr><td style="font-size:13px;color:#8a8578">Tax</td><td style="text-align:right;font-size:13px">${money(order.taxTotal, order.currency)}</td></tr>
      <tr><td style="padding-top:8px;font-size:15px;font-weight:800">Total</td><td style="padding-top:8px;text-align:right;font-size:15px;font-weight:800">${money(order.grandTotal, order.currency)}</td></tr>
    </table>
    ${issuedGiftCards.length ? `<table role="presentation" width="100%" style="border-collapse:collapse;background:#f4efe9;border-radius:8px;margin-top:20px"><tr><td style="padding:16px 20px">
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">Your gift card${issuedGiftCards.length > 1 ? 's' : ''}</p>
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#8a8578;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>` : ''}
    ${url ? `<p style="margin:28px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `)
  const text = `Thanks for your order ${order.orderNumber}. Total: ${money(order.grandTotal, order.currency)}.${issuedGiftCards.length ? ` Gift card code${issuedGiftCards.length > 1 ? 's' : ''}: ${issuedGiftCards.map((c: any) => `${c.code} (${money(c.balance, order.currency)})`).join(', ')}.` : ''}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, `Order confirmed — ${order.orderNumber}`, html, text)
}

export async function sendFulfillmentEmail(orderId: string) {
  if (!(await settingEnabled('email.fulfillment'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return { sent: false, skipped: true }

  const url = siteUrl() ? `${siteUrl()}/account/orders/${order.orderNumber}` : null
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Your order is on its way</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">Order ${escapeHtml(order.orderNumber)} has shipped.</p>
    ${order.shippingMethod ? `<p style="font-size:13px;color:#8a8578;margin:0 0 6px">Shipping method: ${escapeHtml(order.shippingMethod)}</p>` : ''}
    ${order.trackingNumber ? `<p style="font-size:13px;color:#8a8578;margin:0 0 6px">Tracking number: ${escapeHtml(order.trackingNumber)}</p>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">Track your order</a></p>` : ''}
  `)
  const text = `Order ${order.orderNumber} has shipped.${order.trackingNumber ? ` Tracking number: ${order.trackingNumber}.` : ''}${url ? ` Track your order: ${url}` : ''}`
  return sendEmail(order.email, `Your order has shipped — ${order.orderNumber}`, html, text)
}

export async function sendDraftOrderInvoiceEmail(draftOrderId: string, payUrl: string) {
  const draft = await db.draftOrder.findUnique({ where: { id: draftOrderId }, include: { items: true } })
  if (!draft) return { sent: false, skipped: true }

  const rows = draft.items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#242219">${escapeHtml(item.name)} <span style="color:#8a8578">&times; ${item.quantity}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#242219">${money(item.totalPrice, draft.currency)}</td>
    </tr>`
    )
    .join('')
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Invoice ${escapeHtml(draft.orderNumber)}</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">Please review and pay to complete your order.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:15px;font-weight:800">Total due</td><td style="padding-top:12px;text-align:right;font-size:15px;font-weight:800">${money(draft.grandTotal, draft.currency)}</td></tr>
    </table>
    <p style="margin:24px 0 0"><a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">Review and pay</a></p>
  `)
  const text = `Invoice ${draft.orderNumber}. Total due: ${money(draft.grandTotal, draft.currency)}. Pay online: ${payUrl}`
  return sendEmail(draft.email, `Invoice for your order — ${draft.orderNumber}`, html, text)
}

export async function sendGiftCardIssuedEmail(giftCardId: string) {
  if (!(await settingEnabled('email.giftCard'))) return { sent: false, skipped: true }
  const card = await db.giftCard.findUnique({ where: { id: giftCardId } })
  if (!card || !card.customerId) return { sent: false, skipped: true }
  const customer = await db.user.findUnique({ where: { id: card.customerId } })
  if (!customer) return { sent: false, skipped: true }

  const url = siteUrl() ? `${siteUrl()}/account` : null
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">You've received a gift card</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">${escapeHtml(brandName())} has issued you a gift card worth ${money(card.initialAmount, card.currency)}.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#f4efe9;border-radius:8px"><tr><td style="padding:16px 20px;font-size:18px;font-weight:800;letter-spacing:.04em;text-align:center">${escapeHtml(card.code)}</td></tr></table>
    ${card.expiresAt ? `<p style="font-size:12px;color:#8a8578;margin:12px 0 0">Expires ${new Date(card.expiresAt).toLocaleDateString()}.</p>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">Use it at checkout</a></p>` : ''}
  `)
  const text = `You've received a gift card worth ${money(card.initialAmount, card.currency)}. Code: ${card.code}.${card.expiresAt ? ` Expires ${new Date(card.expiresAt).toLocaleDateString()}.` : ''}`
  return sendEmail(customer.email, `You've received a ${money(card.initialAmount, card.currency)} gift card`, html, text)
}

const RETURN_STATUS_COPY: Record<string, (returnRequest: { id: string; refundAmount: number; notes: string | null }, orderNumber: string, currency: string) => { subject: string; heading: string; message: string }> = {
  APPROVED: (_returnRequest, orderNumber) => ({
    subject: `Your return was approved — ${orderNumber}`,
    heading: 'Your return was approved',
    message: 'Please ship the items back to us. We\'ll process your return as soon as they arrive.',
  }),
  REJECTED: (returnRequest, orderNumber) => ({
    subject: `Update on your return — ${orderNumber}`,
    heading: 'Your return request was declined',
    message: returnRequest.notes ? `We're unable to process this return. ${returnRequest.notes}` : 'We\'re unable to process this return. Contact us if you have questions.',
  }),
  RECEIVED: (returnRequest, orderNumber) => ({
    subject: `We received your return — ${orderNumber}`,
    heading: 'We received your return',
    message: returnRequest.refundAmount > 0 ? 'Your items have arrived and your refund is being processed.' : 'Your items have arrived and your return has been processed.',
  }),
  REFUNDED: (returnRequest, orderNumber, currency) => ({
    subject: `Your refund has been issued — ${orderNumber}`,
    heading: 'Your refund has been issued',
    message: `A refund of ${money(returnRequest.refundAmount, currency)} has been issued for order ${orderNumber}.`,
  }),
}

// Mirrors the in-app Notification already sent by app/api/admin/returns/[id]/route.ts on each
// ReturnRequest transition -- ReturnRequest has no navigable order relation (only a scalar
// orderId), so the order's email/orderNumber/currency are looked up separately, same reasoning
// as that route's own order lookups.
export async function sendReturnStatusEmail(returnId: string, orderId: string) {
  if (!(await settingEnabled('email.returnStatus'))) return { sent: false, skipped: true }
  const returnRequest = await db.returnRequest.findUnique({ where: { id: returnId } })
  if (!returnRequest) return { sent: false, skipped: true }
  const copy = RETURN_STATUS_COPY[returnRequest.status]
  if (!copy) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true } })
  if (!order) return { sent: false, skipped: true }

  const { subject, heading, message } = copy(returnRequest, order.orderNumber, order.currency)
  const url = siteUrl() ? `${siteUrl()}/account/orders/${order.orderNumber}` : null
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">${escapeHtml(message)}</p>
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `)
  const text = `${heading}. ${message}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, subject, html, text)
}

// Committing an order edit can move money on an already-paid order (a refund issued, or an
// additional charge now owed) the same way a return does, but unlike returns/gift cards/
// fulfillment there was no customer-facing side effect at all -- only a staff-only OrderEvent.
// `adjustment` mirrors classifyOrderEditPaymentAdjustment's return shape; null covers an edit
// that changed items/total without moving money on a paid order (still worth telling the
// customer their order changed).
export async function sendOrderEditEmail(orderId: string, adjustment: { type: 'refund' | 'charge'; amount: number } | null) {
  if (!(await settingEnabled('email.orderEdit'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true } })
  if (!order) return { sent: false, skipped: true }

  const heading = adjustment?.type === 'refund' ? 'Your order was updated — a refund is on its way'
    : adjustment?.type === 'charge' ? 'Your order was updated — additional payment required'
    : 'Your order was updated'
  const message = adjustment?.type === 'refund' ? `Your order ${order.orderNumber} was updated by our team. A refund of ${money(adjustment.amount, order.currency)} has been issued.`
    : adjustment?.type === 'charge' ? `Your order ${order.orderNumber} was updated by our team and now requires an additional payment of ${money(adjustment.amount, order.currency)}. We'll be in touch about how to complete it.`
    : `Your order ${order.orderNumber} was updated by our team.`
  const url = siteUrl() ? `${siteUrl()}/account/orders/${order.orderNumber}` : null
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">${escapeHtml(message)}</p>
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `)
  const text = `${heading}. ${message}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, `Your order was updated — ${order.orderNumber}`, html, text)
}

export async function sendAbandonedCheckoutEmail(abandonedCheckoutId: string) {
  if (!(await settingEnabled('email.abandonedCheckout'))) return { sent: false, skipped: true }
  const checkout = await db.abandonedCheckout.findUnique({ where: { id: abandonedCheckoutId } })
  if (!checkout || !checkout.email) return { sent: false, skipped: true }

  let items: Array<{ name?: string; quantity?: number; unitPrice?: number }> = []
  try { items = JSON.parse(checkout.cartJson) } catch { items = [] }
  const rows = items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#242219">${escapeHtml(String(item.name || 'Item'))} <span style="color:#8a8578">&times; ${Number(item.quantity) || 1}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#242219">${money((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1), checkout.currency)}</td>
    </tr>`
    )
    .join('')
  const url = checkout.recoveryUrl || (siteUrl() ? `${siteUrl()}/checkout` : null)
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">You left something in your cart</h1>
    <p style="font-size:14px;color:#4a473d;margin:0 0 20px">Pick up right where you left off.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    ${checkout.subtotal ? `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px"><tr><td style="padding-top:12px;font-size:15px;font-weight:800">Subtotal</td><td style="padding-top:12px;text-align:right;font-size:15px;font-weight:800">${money(checkout.subtotal, checkout.currency)}</td></tr></table>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">Complete your order</a></p>` : ''}
  `)
  const text = `You left items in your cart.${url ? ` Complete your order: ${url}` : ''}`
  return sendEmail(checkout.email, 'You left something in your cart', html, text)
}
