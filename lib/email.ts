import { db } from '@/lib/prisma'
import { issueGiftCardsForOrder } from '@/lib/gift-cards'
import { runInBackground } from '@/lib/background'
import type { WeeklyFacts } from '@/lib/weekly-report'
import { securityAlertText, type SecurityAlert } from '@/lib/sign-in-devices'

function credentials() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return null
  return { apiKey, from }
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
}

function money(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toFixed(2)}`
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

// The store's own name, logo and brand colour (Theme settings), so emails look like the shop.
// Read once per send; falls back to the build-time name if the theme can't be loaded.
type Brand = { name: string; logo: string; color: string }
async function emailBrand(): Promise<Brand> {
  const fallback = { name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Brand', logo: '', color: '#d7261e' }
  try {
    const { getThemeState } = await import('@/lib/theme')
    const { theme } = await getThemeState()
    const absolute = (u: unknown) => {
      const v = String(u || '').trim()
      if (/^https:\/\//i.test(v)) return v
      return v.startsWith('/') && siteUrl() ? `${siteUrl()}${v}` : ''
    }
    const color = /^#[0-9a-f]{6}$/i.test(theme?.colors?.primary || '') ? theme.colors.primary : fallback.color
    // Emails need a light-on-colour logo for the header band: the dark-background logo if
    // there is one. (SVG logos don't show in Gmail/Outlook, so they fall back to the name.)
    const logo = absolute(theme?.logoUrlDark || '')
    return { name: String(theme?.brandName || fallback.name).trim() || fallback.name, logo: /\.svg(\?|$)/i.test(logo) ? '' : logo, color }
  } catch {
    return fallback
  }
}

function button(href: string, label: string, brand: Brand) {
  return `<p style="margin:24px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">${escapeHtml(label)}</a></p>`
}

function layout(bodyHtml: string, brand: Brand) {
  const url = siteUrl()
  const head = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" height="32" style="display:block;height:32px;width:auto;border:0">`
    : `<span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.01em">${escapeHtml(brand.name)}</span>`
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#121212">
<table role="presentation" width="100%" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:94%;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:${brand.color};padding:20px 28px">${url ? `<a href="${url}" style="text-decoration:none">${head}</a>` : head}</td></tr>
<tr><td style="padding:28px">${bodyHtml}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #eee;font-size:12px;color:#6b7280">${escapeHtml(brand.name)}${url ? ` &middot; <a href="${url}" style="color:#6b7280">${url.replace(/^https?:\/\//, '')}</a>` : ''}</td></tr>
</table></td></tr></table>
</body></html>`
}

// Guests have no account, so their order link carries the order email (the order page checks it).
function orderLink(orderNumber: string, email: string, userId?: string | null) {
  const base = siteUrl()
  if (!base) return null
  return `${base}/account/orders/${encodeURIComponent(orderNumber)}${userId ? '' : `?email=${encodeURIComponent(email)}`}`
}

async function settingEnabled(key: string) {
  const setting = await db.setting.findUnique({ where: { key } })
  return setting?.value !== 'false'
}

// The sender customers see. Settings > Email can change its name and its address; the address
// must be at the domain verified in Resend (the domain of EMAIL_FROM), since Resend refuses any
// other. An empty or unusable setting keeps the name or address from EMAIL_FROM.
function parseSender(value: string) {
  const match = /^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/.exec(value)
  if (match) return { name: match[1].replace(/^"|"$/g, '').trim(), address: match[2].toLowerCase() }
  return { name: '', address: value.trim().toLowerCase() }
}

export function senderDomain(envFrom: string) {
  return parseSender(envFrom).address.split('@')[1] || ''
}

export function isAllowedSenderAddress(address: string, envFrom: string) {
  const domain = senderDomain(envFrom)
  const value = address.trim().toLowerCase()
  return Boolean(domain) && /^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9.-]+$/.test(value) && value.endsWith('@' + domain)
}

export function senderFrom(envFrom: string, name?: string | null, address?: string | null) {
  const fallback = parseSender(envFrom)
  const cleanName = String(name || '').replace(/[<>"\\,;:@()[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  const cleanAddress = String(address || '').trim().toLowerCase()
  const useName = cleanName || fallback.name
  const useAddress = cleanAddress && isAllowedSenderAddress(cleanAddress, envFrom) ? cleanAddress : fallback.address
  return useName ? `${useName} <${useAddress}>` : useAddress
}

// The From line emails go out with: Settings > Email > Sender when set, else EMAIL_FROM.
export async function configuredSender(envFrom: string) {
  try {
    const rows = await db.setting.findMany({ where: { key: { in: ['email.fromName', 'email.fromAddress'] } }, select: { key: true, value: true } })
    const value = Object.fromEntries(rows.map(row => [row.key, row.value]))
    return senderFrom(envFrom, value['email.fromName'], value['email.fromAddress'])
  } catch {
    return envFrom
  }
}

// Every attempt is recorded for Admin > Website status (sent / failed with Resend's reason /
// skipped). Written after the response; a failed write never affects the email itself.
function logEmail(to: string, subject: string, status: 'sent' | 'failed' | 'skipped', providerId?: string | null, error?: string | null) {
  runInBackground(
    db.emailLog.create({ data: { to: String(to).slice(0, 320), subject: String(subject).slice(0, 300), status, providerId: providerId || null, error: error ? error.slice(0, 500) : null } })
      .catch(err => console.error('[email] could not log', err)),
  )
}

export async function sendEmail(to: string, subject: string, html: string, text: string, extra?: { headers?: Record<string, string> }) {
  // Orders taken on WhatsApp or by phone may have no email address: there is nobody to send to.
  if (!to || !to.includes('@')) return { sent: false, skipped: true }
  const config = credentials()
  if (!config) {
    console.warn('[email] RESEND_API_KEY/EMAIL_FROM not configured; skipping send', { to, subject })
    logEmail(to, subject, 'skipped', null, 'Email sending is not set up (RESEND_API_KEY / EMAIL_FROM)')
    return { sent: false, skipped: true }
  }
  try {
    const from = await configuredSender(config.from)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text, ...(extra?.headers ? { headers: extra.headers } : {}) }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('[email] send rejected', response.status, detail)
      // Resend answers {"message": "..."}; keep its explanation, not the raw body.
      let reason = detail
      try { reason = String(JSON.parse(detail)?.message || detail) } catch {}
      logEmail(to, subject, 'failed', null, `Resend answered ${response.status}${reason ? `: ${reason}` : ''}`)
      return { sent: false, skipped: false }
    }
    const accepted = await response.json().catch(() => null) as { id?: string } | null
    logEmail(to, subject, 'sent', accepted?.id || null)
    return { sent: true, skipped: false }
  } catch (error) {
    console.error('[email] send failed', error)
    logEmail(to, subject, 'failed', null, error instanceof Error ? error.message : String(error))
    return { sent: false, skipped: false }
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, expiresInMinutes: number) {
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46">We received a request to reset the password for this account. This link expires in ${expiresInMinutes} minutes.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Reset password</a></p>
    <p style="font-size:12px;color:#6b7280">If you didn't request this, you can safely ignore this email.</p>
  `, brand)
  const text = `Reset your password: ${resetUrl} (expires in ${expiresInMinutes} minutes). If you didn't request this, ignore this email.`
  return sendEmail(to, 'Reset your password', html, text)
}

export async function sendOrderConfirmationEmail(orderId: string) {
  if (!(await settingEnabled('email.customerOrder'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return { sent: false, skipped: true }

  // This confirmation fires right at order placement for every non-CARD (and $0) order,
  // including COD/BANK_TRANSFER ones that are still UNPAID at this point -- issuing a gift
  // card here regardless would hand the customer a real, spendable code before they've
  // actually paid, which they could redeem or resell and then simply refuse delivery / never
  // complete the transfer. Deferring issuance until the order is actually PAID (staff marking
  // it paid already re-issues via issueAndNotifyGiftCardsForOrder below) keeps this the same
  // "issued once payment is confirmed" guarantee issueGiftCardsForOrder itself documents.
  const issuedGiftCards = order.paymentStatus === 'PAID' ? await issueGiftCardsForOrder(db, orderId) : []

  const url = orderLink(order.orderNumber, order.email, order.userId)
  // What the customer still has to do to pay, and where it's going.
  const due = money(order.grandTotal, order.currency)
  const paymentNote = order.paymentStatus === 'PAID' || order.grandTotal === 0 ? 'Paid in full. Nothing more to pay.'
    : order.paymentMethod === 'COD' ? `Please have <strong>${due}</strong> ready in cash when your order arrives.`
    : order.paymentMethod === 'BANK_TRANSFER' ? `Please pay <strong>${due}</strong> by bank transfer. Your order ships once the payment arrives.`
    : order.paymentMethod === 'CARD' ? 'Your card payment is being confirmed.' : ''
  let address: Record<string, string> = {}
  try { address = JSON.parse(order.shippingAddressJson || '{}') || {} } catch { address = {} }
  const addressLines = [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    [address.line1, address.line2].filter(Boolean).join(', '),
    [address.city, address.region].filter(Boolean).join(', '),
    address.phone || order.phone || '',
  ].map(line => String(line || '').trim()).filter(Boolean)
  const rows = order.items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#121212">${escapeHtml(item.name)} <span style="color:#6b7280">&times; ${item.quantity}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#121212">${money(item.totalPrice, order.currency)}</td>
    </tr>`
    )
    .join('')
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Thanks for your order</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">Order #${escapeHtml(order.orderNumber)}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:13px;color:#6b7280">Subtotal</td><td style="padding-top:12px;text-align:right;font-size:13px">${money(order.subtotal, order.currency)}</td></tr>
      ${order.discountTotal ? `<tr><td style="font-size:13px;color:#6b7280">Discount</td><td style="text-align:right;font-size:13px">-${money(order.discountTotal, order.currency)}</td></tr>` : ''}
      <tr><td style="font-size:13px;color:#6b7280">Delivery</td><td style="text-align:right;font-size:13px">${order.shippingTotal ? money(order.shippingTotal, order.currency) : 'Free'}</td></tr>
      ${order.taxTotal ? `<tr><td style="font-size:13px;color:#6b7280">Tax</td><td style="text-align:right;font-size:13px">${money(order.taxTotal, order.currency)}</td></tr>` : ''}
      <tr><td style="padding-top:8px;font-size:15px;font-weight:800">Total</td><td style="padding-top:8px;text-align:right;font-size:15px;font-weight:800">${money(order.grandTotal, order.currency)}</td></tr>
    </table>
    ${paymentNote ? `<p style="margin:20px 0 0;padding:12px 16px;background:#fdecea;border-radius:10px;font-size:14px;color:#121212">${paymentNote}</p>` : ''}
    ${addressLines.length ? `<p style="font-size:13px;font-weight:700;margin:20px 0 4px">Delivering to</p><p style="font-size:13px;line-height:1.6;color:#3f3f46;margin:0">${addressLines.map(escapeHtml).join('<br>')}</p>` : ''}
    ${issuedGiftCards.length ? `<table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px;margin-top:20px"><tr><td style="padding:16px 20px">
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">Your gift card${issuedGiftCards.length > 1 ? 's' : ''}</p>
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>` : ''}
    ${url ? `<p style="margin:28px 0 0"><a href="${url}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `, brand)
  const text = `Thanks for your order #${order.orderNumber}. Total: ${money(order.grandTotal, order.currency)}.${paymentNote ? ' ' + paymentNote.replace(/<[^>]+>/g, '') : ''}${issuedGiftCards.length ? ` Gift card code${issuedGiftCards.length > 1 ? 's' : ''}: ${issuedGiftCards.map((c: any) => `${c.code} (${money(c.balance, order.currency)})`).join(', ')}.` : ''}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, `Order confirmed — #${order.orderNumber}`, html, text)
}

export async function sendFulfillmentEmail(orderId: string) {
  if (!(await settingEnabled('email.fulfillment'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return { sent: false, skipped: true }

  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Your order is on its way</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">Order #${escapeHtml(order.orderNumber)} has shipped.</p>
    ${order.shippingMethod ? `<p style="font-size:13px;color:#6b7280;margin:0 0 6px">Delivery: ${escapeHtml(order.shippingMethod)}</p>` : ''}
    ${order.trackingNumber ? `<p style="font-size:13px;color:#6b7280;margin:0 0 6px">Tracking number: ${escapeHtml(order.trackingNumber)}</p>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Track your order</a></p>` : ''}
  `, brand)
  const text = `Order #${order.orderNumber} has shipped.${order.trackingNumber ? ` Tracking number: ${order.trackingNumber}.` : ''}${url ? ` Track your order: ${url}` : ''}`
  return sendEmail(order.email, `Your order has shipped — #${order.orderNumber}`, html, text)
}

export async function sendDraftOrderInvoiceEmail(draftOrderId: string, payUrl: string) {
  const draft = await db.draftOrder.findUnique({ where: { id: draftOrderId }, include: { items: true } })
  if (!draft) return { sent: false, skipped: true }

  const rows = draft.items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#121212">${escapeHtml(item.name)} <span style="color:#6b7280">&times; ${item.quantity}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#121212">${money(item.totalPrice, draft.currency)}</td>
    </tr>`
    )
    .join('')
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Invoice ${escapeHtml(draft.orderNumber)}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">Please review and pay to complete your order.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:15px;font-weight:800">Total due</td><td style="padding-top:12px;text-align:right;font-size:15px;font-weight:800">${money(draft.grandTotal, draft.currency)}</td></tr>
    </table>
    <p style="margin:24px 0 0"><a href="${escapeHtml(payUrl)}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Review and pay</a></p>
  `, brand)
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
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">You've received a gift card</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(brand.name)} has issued you a gift card worth ${money(card.initialAmount, card.currency)}.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px"><tr><td style="padding:16px 20px;font-size:18px;font-weight:800;letter-spacing:.04em;text-align:center">${escapeHtml(card.code)}</td></tr></table>
    ${card.expiresAt ? `<p style="font-size:12px;color:#6b7280;margin:12px 0 0">Expires ${new Date(card.expiresAt).toLocaleDateString()}.</p>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Use it at checkout</a></p>` : ''}
  `, brand)
  const text = `You've received a gift card worth ${money(card.initialAmount, card.currency)}. Code: ${card.code}.${card.expiresAt ? ` Expires ${new Date(card.expiresAt).toLocaleDateString()}.` : ''}`
  return sendEmail(customer.email, `You've received a ${money(card.initialAmount, card.currency)} gift card`, html, text)
}

const RETURN_STATUS_COPY: Record<string, (returnRequest: { id: string; refundAmount: number; notes: string | null }, orderNumber: string, currency: string) => { subject: string; heading: string; message: string }> = {
  APPROVED: (_returnRequest, orderNumber) => ({
    subject: `Your return was approved — #${orderNumber}`,
    heading: 'Your return was approved',
    message: 'Please ship the items back to us. We\'ll process your return as soon as they arrive.',
  }),
  REJECTED: (returnRequest, orderNumber) => ({
    subject: `Update on your return — #${orderNumber}`,
    heading: 'Your return request was declined',
    message: returnRequest.notes ? `We're unable to process this return. ${returnRequest.notes}` : 'We\'re unable to process this return. Contact us if you have questions.',
  }),
  RECEIVED: (returnRequest, orderNumber) => ({
    subject: `We received your return — #${orderNumber}`,
    heading: 'We received your return',
    message: returnRequest.refundAmount > 0 ? 'Your items have arrived and your refund is being processed.' : 'Your items have arrived and your return has been processed.',
  }),
  REFUNDED: (returnRequest, orderNumber, currency) => ({
    subject: `Your refund has been issued — #${orderNumber}`,
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
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true } })
  if (!order) return { sent: false, skipped: true }

  const { subject, heading, message } = copy(returnRequest, order.orderNumber, order.currency)
  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(message)}</p>
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `, brand)
  const text = `${heading}. ${message}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, subject, html, text)
}

// Committing an order edit can move money on an already-paid order (a refund issued, or an
// additional charge now owed) the same way a return does, but unlike returns/gift cards/
// fulfillment there was no customer-facing side effect at all -- only a staff-only OrderEvent.
// `adjustment` mirrors classifyOrderEditPaymentAdjustment's return shape; null covers an edit
// that changed items/total without moving money on a paid order (still worth telling the
// customer their order changed).
// issueGiftCards controls whether a gift-card product added by this edit gets minted now --
// callers pass false when the edit left the order owing more money (a pending manual charge
// with no automatic confirmation), since a gift card shouldn't be issued before it's paid for.
// The caller is expected to re-issue (via issueAndNotifyGiftCardsForOrder) once that payment is
// later confirmed, at which point this same function's gift-card rendering is reused there too.
export async function sendOrderEditEmail(orderId: string, adjustment: { type: 'refund' | 'charge'; amount: number } | null, issueGiftCards = true) {
  if (!(await settingEnabled('email.orderEdit'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true } })
  if (!order) return { sent: false, skipped: true }

  const issuedGiftCards = issueGiftCards ? await issueGiftCardsForOrder(db, orderId) : []

  const heading = adjustment?.type === 'refund' ? 'Your order was updated — a refund is on its way'
    : adjustment?.type === 'charge' ? 'Your order was updated — additional payment required'
    : 'Your order was updated'
  const message = adjustment?.type === 'refund' ? `Your order ${order.orderNumber} was updated by our team. A refund of ${money(adjustment.amount, order.currency)} has been issued.`
    : adjustment?.type === 'charge' ? `Your order ${order.orderNumber} was updated by our team and now requires an additional payment of ${money(adjustment.amount, order.currency)}. We'll be in touch about how to complete it.`
    : `Your order ${order.orderNumber} was updated by our team.`
  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(message)}</p>
    ${issuedGiftCards.length ? `<table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px;margin-bottom:20px"><tr><td style="padding:16px 20px">
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">Your gift card${issuedGiftCards.length > 1 ? 's' : ''}</p>
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">View your order</a></p>` : ''}
  `, brand)
  const text = `${heading}. ${message}${issuedGiftCards.length ? ` Gift card code${issuedGiftCards.length > 1 ? 's' : ''}: ${issuedGiftCards.map((c: any) => `${c.code} (${money(c.balance, order.currency)})`).join(', ')}.` : ''}${url ? ` View your order: ${url}` : ''}`
  return sendEmail(order.email, `Your order was updated — ${order.orderNumber}`, html, text)
}

// Fired once a pending "additional payment required" charge from an order edit is later
// confirmed collected (admin marks the order PAID) -- mints any gift-card items that were
// deliberately withheld at edit-commit time and lets the customer know via the same template.
export async function issueAndNotifyGiftCardsForOrder(orderId: string) {
  if (!(await settingEnabled('email.orderEdit'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true } })
  if (!order) return { sent: false, skipped: true }
  const issuedGiftCards = await issueGiftCardsForOrder(db, orderId)
  if (!issuedGiftCards.length) return { sent: false, skipped: true }

  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Your gift card${issuedGiftCards.length > 1 ? 's are' : ' is'} ready</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">Payment for order ${escapeHtml(order.orderNumber)} has been received.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px"><tr><td style="padding:16px 20px">
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>
  `, brand)
  const text = `Payment for order ${order.orderNumber} has been received. Gift card code${issuedGiftCards.length > 1 ? 's' : ''}: ${issuedGiftCards.map((c: any) => `${c.code} (${money(c.balance, order.currency)})`).join(', ')}.`
  return sendEmail(order.email, `Your gift card is ready — ${order.orderNumber}`, html, text)
}

// "Notify me when it's back" (lib/back-in-stock.ts): the product the customer asked about.
export async function sendBackInStockEmail(to: string, product: { name: string; slug: string; image?: string }) {
  const base = siteUrl()
  const url = base ? `${base}/product/${encodeURIComponent(product.slug)}` : null
  const image = product.image && /^https:\/\//i.test(product.image) ? product.image : product.image?.startsWith('/') && base ? `${base}${product.image}` : ''
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">It's back in stock</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 20px">You asked us to tell you when this is available again. Here it is, order it before it sells out.</p>
    ${image ? `<img src="${escapeHtml(image)}" alt="" width="160" style="display:block;width:160px;max-width:100%;height:auto;border-radius:12px;margin:0 0 14px">` : ''}
    <p style="font-size:16px;font-weight:800;color:#121212;margin:0">${escapeHtml(product.name)}</p>
    ${url ? button(url, 'Shop it now', brand) : ''}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">We only send this once, because you asked on our website.</p>
  `, brand)
  const text = `${product.name} is back in stock.${url ? ` Order it here: ${url}` : ''}`
  return sendEmail(to, `Back in stock: ${product.name}`, html, text)
}

// Sent by staff from the admin (needs Settings > Notifications > "Abandoned checkout recovery")
// or automatically by lib/cart-reminders.ts (needs its own switch, checked there). Both carry a
// link to stop these emails.
export async function sendAbandonedCheckoutEmail(abandonedCheckoutId: string, options: { automatic?: boolean; unsubscribeUrl?: string; oneClickUnsubscribeUrl?: string } = {}) {
  if (!options.automatic && !(await settingEnabled('email.abandonedCheckout'))) return { sent: false, skipped: true }
  const checkout = await db.abandonedCheckout.findUnique({ where: { id: abandonedCheckoutId } })
  if (!checkout || !checkout.email) return { sent: false, skipped: true }

  let items: Array<{ name?: string; quantity?: number; unitPrice?: number }> = []
  try { items = JSON.parse(checkout.cartJson) } catch { items = [] }
  const rows = items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#121212">${escapeHtml(String(item.name || 'Item'))} <span style="color:#6b7280">&times; ${Number(item.quantity) || 1}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#121212">${money((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1), checkout.currency)}</td>
    </tr>`
    )
    .join('')
  const url = checkout.recoveryUrl || (siteUrl() ? `${siteUrl()}/checkout` : null)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">You left something in your cart</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">Pick up right where you left off.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    ${checkout.subtotal ? `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px"><tr><td style="padding-top:12px;font-size:15px;font-weight:800">Subtotal</td><td style="padding-top:12px;text-align:right;font-size:15px;font-weight:800">${money(checkout.subtotal, checkout.currency)}</td></tr></table>` : ''}
    ${url ? `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Complete your order</a></p>` : ''}
    ${options.unsubscribeUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Don't want cart reminders? <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6b7280">Stop these emails</a>.</p>` : ''}
  `, brand)
  const text = `You left items in your cart.${url ? ` Complete your order: ${url}` : ''}${options.unsubscribeUrl ? `\n\nStop cart reminder emails: ${options.unsubscribeUrl}` : ''}`
  // List-Unsubscribe: Gmail and others show their own "Unsubscribe" button, which posts to it.
  const headers = options.oneClickUnsubscribeUrl ? { 'List-Unsubscribe': `<${options.oneClickUnsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  return sendEmail(checkout.email, 'You left something in your cart', html, text, headers ? { headers } : undefined)
}

// "How was your order?" -- sent by the morning job (/api/internal/daily) a day after delivery,
// once per order, to orders placed with an email. The button opens app/review/[orderNumber].
export async function sendReviewRequestEmail(order: { email: string; orderNumber: string; firstName: string; products: Array<{ name: string; image: string }> }, reviewUrl: string) {
  const brand = await emailBrand()
  const products = order.products.slice(0, 4).map(p => `<tr>
      <td width="56" style="padding:8px 12px 8px 0">${/^https:\/\//i.test(p.image) ? `<img src="${escapeHtml(p.image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:0">` : ''}</td>
      <td style="padding:8px 0;font-size:14px;color:#121212">${escapeHtml(p.name)}</td>
    </tr>`).join('')
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 8px">How was your order${order.firstName ? `, ${escapeHtml(order.firstName)}` : ''}?</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Thank you for shopping with ${escapeHtml(brand.name)}. We hope you like order #${escapeHtml(order.orderNumber)}. Could you rate what you bought? It takes 30 seconds and helps other customers choose.</p>
    ${products ? `<table role="presentation" width="100%" style="border-collapse:collapse">${products}</table>` : ''}
    ${button(reviewUrl, 'Rate my order', brand)}
  `, brand)
  const text = `How was your order #${order.orderNumber}? Rate what you bought (30 seconds): ${reviewUrl}`
  return sendEmail(order.email, `How was your order #${order.orderNumber}?`, html, text)
}

// The owner's morning summary (lib/daily-summary.ts works out the numbers and words).
export async function sendDailySummaryEmail(to: string, summary: { subject: string; dayLabel: string; ordersYesterday: number; sales: string; waiting: string[]; lowStock: Array<{ name: string; left: number }>; reviewEmailsSent: number }) {
  const brand = await emailBrand()
  const admin = siteUrl() ? `${siteUrl()}/admin` : ''
  const link = (path: string, label: string) => admin ? `<a href="${escapeHtml(`${admin}${path}`)}" style="color:${brand.color};font-weight:700;text-decoration:none">${escapeHtml(label)}</a>` : ''
  const stat = (value: string, label: string) => `<td width="50%" style="padding:14px 16px;background:#f6f6f4;border-radius:10px"><div style="font-size:22px;font-weight:800;color:#121212">${escapeHtml(value)}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">${escapeHtml(label)}</div></td>`
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Good morning</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 18px">Here is how ${escapeHtml(summary.dayLabel)} went.</p>
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px"><tr>${stat(String(summary.ordersYesterday), summary.ordersYesterday === 1 ? 'order' : 'orders')}${stat(summary.sales, 'sales')}</tr></table>
    <p style="font-size:15px;font-weight:800;margin:24px 0 8px">Waiting for you</p>
    ${summary.waiting.length
      ? `<ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.8;color:#121212">${summary.waiting.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : '<p style="font-size:14px;color:#3f3f46;margin:0">Nothing. Have a good day!</p>'}
    ${summary.lowStock.length ? `<p style="font-size:15px;font-weight:800;margin:24px 0 8px">Low on stock</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${summary.lowStock.slice(0, 10).map(item => `<tr><td style="padding:6px 0;font-size:14px;border-bottom:1px solid #eee">${escapeHtml(item.name)}</td><td style="padding:6px 0;font-size:14px;text-align:right;border-bottom:1px solid #eee;font-weight:700;color:${item.left <= 0 ? '#b42318' : '#121212'}">${item.left <= 0 ? 'sold out' : `${item.left} left`}</td></tr>`).join('')}</table>
    ${summary.lowStock.length > 10 ? `<p style="font-size:13px;color:#6b7280;margin:6px 0 0">and ${summary.lowStock.length - 10} more</p>` : ''}` : ''}
    ${summary.reviewEmailsSent ? `<p style="font-size:13px;color:#6b7280;margin:20px 0 0">This morning ${summary.reviewEmailsSent} customer${summary.reviewEmailsSent === 1 ? ' was' : 's were'} asked by email to rate their order.</p>` : ''}
    ${admin ? `<p style="font-size:14px;margin:24px 0 0">${[link('/orders', 'Open orders'), link('/orders/unfinished', 'Unfinished checkouts'), link('/inventory', 'Stock'), link('/reviews', 'Reviews')].join(' &nbsp;·&nbsp; ')}</p>` : ''}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">You can turn this email off in Admin &gt; Settings &gt; Notifications.</p>
  `, brand)
  const text = [`Good morning. ${summary.dayLabel}: ${summary.ordersYesterday} order(s), ${summary.sales}.`, ...(summary.waiting.length ? ['Waiting for you:', ...summary.waiting.map(line => `- ${line}`)] : ['Nothing waiting for you.']), ...(admin ? [`Admin: ${admin}`] : [])].join('\n')
  return sendEmail(to, summary.subject, html, text)
}

// A sign-in from a new device, or an account locked by wrong passwords or 2-step codes
// (lib/sign-in-alerts.ts). Sent to the account's owner and the super admins.
export async function sendSecurityAlertEmail(to: string, alert: SecurityAlert) {
  const brand = await emailBrand()
  const message = securityAlertText(alert)
  const settings = siteUrl() ? `${siteUrl()}/admin/settings` : ''
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px;color:#b42318">Security alert</h1>
    ${message.lines.map(line => `<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 10px">${escapeHtml(line)}</p>`).join('')}
    ${alert.ip ? `<p style="font-size:12px;color:#6b7280;margin:14px 0 0">Address: ${escapeHtml(alert.ip)}</p>` : ''}
    ${settings ? button(settings, 'Open settings', brand) : ''}
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0">You can turn these alerts off in Admin &gt; Settings &gt; Notifications.</p>
  `, brand)
  const text = [message.subject, '', ...message.lines, ...(settings ? ['', `Settings: ${settings}`] : [])].join('\n')
  return sendEmail(to, message.subject, html, text)
}

// "A customer could not place an order" / "An order is waiting": short and plain, with one button.
export async function sendOrderProblemEmail(to: string, message: { subject: string; lines: string[]; path: string; button: string }) {
  const brand = await emailBrand()
  const link = siteUrl() ? `${siteUrl()}${message.path}` : ''
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px;color:#b42318">${escapeHtml(message.subject)}</h1>
    ${message.lines.map(line => `<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 10px">${escapeHtml(line)}</p>`).join('')}
    ${link ? button(link, message.button, brand) : ''}
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0">You can turn these alerts off in Admin &gt; Settings &gt; Notifications.</p>
  `, brand)
  const text = [message.subject, '', ...message.lines, ...(link ? ['', `${message.button}: ${link}`] : [])].join('\n')
  return sendEmail(to, message.subject, html, text)
}

// The owner's weekly report (Mondays, app/api/internal/daily/route.ts, lib/weekly-report.ts).
export async function sendWeeklyReportEmail(to: string, r: { subject: string; weekLabel: string; currency: string; facts: WeeklyFacts; ordersChange: string; salesChange: string; cashWithDrivers: number; lowStock: number; adSpend: number }) {
  const brand = await emailBrand()
  const admin = siteUrl() ? `${siteUrl()}/admin` : ''
  const m = (cents: number) => money(cents, r.currency)
  const f = r.facts
  const stat = (value: string, label: string, note = '') => `<td width="33%" style="padding:14px 12px;background:#f6f6f4;border-radius:10px;vertical-align:top"><div style="font-size:20px;font-weight:800;color:#121212">${escapeHtml(value)}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">${escapeHtml(label)}</div>${note ? `<div style="font-size:12px;font-weight:700;color:${note.startsWith('-') ? '#b42318' : '#15803d'};margin-top:4px">${escapeHtml(note)} vs last week</div>` : ''}</td>`
  const list = (rows: string[]) => rows.length ? `<table role="presentation" width="100%" style="border-collapse:collapse">${rows.join('')}</table>` : '<p style="font-size:14px;color:#6b7280;margin:0">None this week.</p>'
  const row = (left: string, right: string) => `<tr><td style="padding:6px 0;font-size:14px;border-bottom:1px solid #eee">${escapeHtml(left)}</td><td style="padding:6px 0;font-size:14px;text-align:right;border-bottom:1px solid #eee;font-weight:700">${escapeHtml(right)}</td></tr>`
  const link = (path: string, label: string) => admin ? `<a href="${escapeHtml(`${admin}${path}`)}" style="color:${brand.color};font-weight:700;text-decoration:none">${escapeHtml(label)}</a>` : ''
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">Your week</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 18px">${escapeHtml(r.weekLabel)}</p>
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:6px 0;margin:0 -6px"><tr>${stat(m(f.sales), 'sales', r.salesChange)}${stat(String(f.orders), f.orders === 1 ? 'order' : 'orders', r.ordersChange)}${stat(m(f.average), 'average order')}</tr></table>
    <p style="font-size:14px;color:#3f3f46;margin:16px 0 0">${f.delivered} delivered · ${f.cancelled} cancelled · ${f.newCustomers} new customer${f.newCustomers === 1 ? '' : 's'} · ${f.returningCustomers} came back</p>
    <p style="font-size:15px;font-weight:800;margin:24px 0 8px">Best sellers</p>
    ${list(f.topProducts.map(p => row(p.name, `${p.units} sold`)))}
    <p style="font-size:15px;font-weight:800;margin:24px 0 8px">Top areas</p>
    ${list(f.topAreas.map(a => row(a.area, `${a.orders} order${a.orders === 1 ? '' : 's'}`)))}
    <p style="font-size:15px;font-weight:800;margin:24px 0 8px">To keep an eye on</p>
    <ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.8;color:#121212">
      <li>${r.cashWithDrivers ? `${escapeHtml(m(r.cashWithDrivers))} cash with drivers, not handed over yet` : 'No cash waiting with drivers'}</li>
      <li>${r.lowStock ? `${r.lowStock} product${r.lowStock === 1 ? '' : 's'} low on stock` : 'Stock looks fine'}</li>
      <li>${r.adSpend ? `${escapeHtml(m(r.adSpend))} spent on ads this week` : 'No ad spend entered this week'}</li>
    </ul>
    ${admin ? `<p style="font-size:14px;margin:24px 0 0">${[link('/reports', 'Profit report'), link('/inventory/reorder', 'What to reorder'), link('/orders/drivers', 'Drivers')].join(' &nbsp;·&nbsp; ')}</p>` : ''}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">You can turn this email off in Admin &gt; Settings &gt; Notifications.</p>
  `, brand)
  const text = [`Your week (${r.weekLabel}): ${f.orders} order(s), ${m(f.sales)} in sales (${r.salesChange || 'no change'} vs last week).`, `${f.delivered} delivered, ${f.cancelled} cancelled, ${f.newCustomers} new customer${f.newCustomers === 1 ? "" : "s"}.`, ...(f.topProducts.length ? ['Best sellers:', ...f.topProducts.map(p => `- ${p.name}: ${p.units}`)] : []), ...(admin ? [`Admin: ${admin}`] : [])].join('\n')
  return sendEmail(to, r.subject, html, text)
}
