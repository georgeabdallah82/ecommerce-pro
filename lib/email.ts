import { db } from '@/lib/prisma'

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
    ${url ? `<p style="margin:28px 0 0"><a href="${url}" style="display:inline-block;background:#6b7a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `)
  const text = `Thanks for your order ${order.orderNumber}. Total: ${money(order.grandTotal, order.currency)}.${url ? ` View your order: ${url}` : ''}`
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
