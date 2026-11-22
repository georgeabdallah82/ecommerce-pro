import { db } from '@/lib/prisma'
import { issueGiftCardsForOrder } from '@/lib/gift-cards'
import { runInBackground } from '@/lib/background'
import { queueRetry } from '@/lib/outbox'
import type { WeeklyFacts } from '@/lib/weekly-report'
import { securityAlertText, type SecurityAlert } from '@/lib/sign-in-devices'
import { dateLocale, isRtl, translator, type Lang } from '@/lib/i18n'
import { customerLang, langFor } from '@/lib/message-lang'

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

// Customer emails are written in the customer's language (lib/message-lang.ts, docs/arabic-messages-2026-11.md):
// their texts are looked up in lib/i18n-ar.ts like the storefront's, and Arabic ones read right to left, with the
// amounts on the left. Staff emails stay English.
const end = (lang: Lang) => (isRtl(lang) ? 'left' : 'right')

function layout(bodyHtml: string, brand: Brand, lang: Lang = 'en') {
  const dir = isRtl(lang) ? 'rtl' : 'ltr'
  const url = siteUrl()
  const head = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" height="32" style="display:block;height:32px;width:auto;border:0">`
    : `<span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.01em">${escapeHtml(brand.name)}</span>`
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body dir="${dir}" style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#121212">
<table role="presentation" width="100%" dir="${dir}" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" dir="${dir}" style="max-width:94%;background:#fff;border-radius:14px;overflow:hidden">
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

// The Resend endpoint (a test server's address in local checks, through RESEND_API_URL).
const resendUrl = () => process.env.RESEND_API_URL || 'https://api.resend.com/emails'

// Too many requests, or Resend's own server error, may pass; anything else it refuses (an address, the sender's
// domain, the key) will not, and is not tried again.
export function emailFailureIsPermanent(status: number) {
  return status !== 429 && status < 500
}

export type QueuedEmail = { to: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey: string }

// One try. The same idempotency key goes with every try of an email, so Resend sends it once.
async function deliverEmail(config: { apiKey: string; from: string }, message: QueuedEmail): Promise<{ ok: boolean; error?: string; permanent?: boolean; providerId?: string | null }> {
  try {
    const from = await configuredSender(config.from)
    const response = await fetch(resendUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}`, 'idempotency-key': message.idempotencyKey },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, html: message.html, text: message.text, ...(message.headers ? { headers: message.headers } : {}) }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('[email] send rejected', response.status, detail)
      // Resend answers {"message": "..."}; keep its explanation, not the raw body.
      let reason = detail
      try { reason = String(JSON.parse(detail)?.message || detail) } catch {}
      return { ok: false, error: `Resend answered ${response.status}${reason ? `: ${reason}` : ''}`, permanent: emailFailureIsPermanent(response.status) }
    }
    const accepted = await response.json().catch(() => null) as { id?: string } | null
    return { ok: true, providerId: accepted?.id || null }
  } catch (error) {
    console.error('[email] send failed', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// `retry: false` for an email that is no use later: a password reset link expires within the hour.
export async function sendEmail(to: string, subject: string, html: string, text: string, extra?: { headers?: Record<string, string>; retry?: boolean }) {
  // Orders taken on WhatsApp or by phone may have no email address, and accounts made by a WhatsApp sign-in have a
  // placeholder one (lib/phone-sign-in.ts): there is nobody to send to.
  if (!to || !to.includes('@') || /@phone\.invalid$/i.test(to.trim())) return { sent: false, skipped: true }
  const config = credentials()
  if (!config) {
    console.warn('[email] RESEND_API_KEY/EMAIL_FROM not configured; skipping send', { to, subject })
    logEmail(to, subject, 'skipped', null, 'Email sending is not set up (RESEND_API_KEY / EMAIL_FROM)')
    return { sent: false, skipped: true }
  }
  const message: QueuedEmail = { to, subject, html, text, ...(extra?.headers ? { headers: extra.headers } : {}), idempotencyKey: crypto.randomUUID() }
  const result = await deliverEmail(config, message)
  logEmail(to, subject, result.ok ? 'sent' : 'failed', result.providerId, result.error)
  // A failure that may pass is tried again by the hourly job (lib/outbox.ts).
  if (!result.ok && !result.permanent && extra?.retry !== false) await queueRetry('email', message, result.error || 'Send failed')
  return { sent: result.ok, skipped: false }
}

// A queued email's next try (lib/outbox.ts), with the idempotency key of its first.
export async function retryQueuedEmail(message: QueuedEmail) {
  const config = credentials()
  if (!config) return { ok: false, error: 'Email sending is not set up (RESEND_API_KEY / EMAIL_FROM)', permanent: true }
  if (!message?.to || !message.idempotencyKey) return { ok: false, error: 'Nothing to send', permanent: true }
  const result = await deliverEmail(config, message)
  logEmail(message.to, message.subject, result.ok ? 'sent' : 'failed', result.providerId, result.error)
  return result
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, expiresInMinutes: number, lang: Lang = 'en') {
  const t = translator(lang)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(t('Reset your password'))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46">${escapeHtml(t('We received a request to reset the password for this account. This link expires in {minutes} minutes.', { minutes: expiresInMinutes }))}</p>
    ${button(resetUrl, t('Reset password'), brand)}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">${escapeHtml(t("If you didn't request this, you can safely ignore this email."))}</p>
  `, brand, lang)
  const text = t("Reset your password: {url} (expires in {minutes} minutes). If you didn't request this, ignore this email.", { url: resetUrl, minutes: expiresInMinutes })
  return sendEmail(to, t('Reset your password'), html, text, { retry: false })
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

  const lang = await langFor(order)
  const t = translator(lang)
  const url = orderLink(order.orderNumber, order.email, order.userId)
  // What the customer still has to do to pay, and where it's going.
  const due = `<strong>${escapeHtml(money(order.grandTotal, order.currency))}</strong>`
  const paymentNote = order.paymentStatus === 'PAID' || order.grandTotal === 0 ? escapeHtml(t('Paid in full. Nothing more to pay.'))
    : order.paymentMethod === 'COD' ? t('Please have {amount} ready in cash when your order arrives.', { amount: due })
    : order.paymentMethod === 'BANK_TRANSFER' ? t('Please pay {amount} by bank transfer. Your order ships once the payment arrives.', { amount: due })
    : order.paymentMethod === 'CARD' ? escapeHtml(t('Your card payment is being confirmed.')) : ''
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
      <td style="padding:8px 0;font-size:13px;text-align:${end(lang)};color:#121212">${money(item.totalPrice, order.currency)}</td>
    </tr>`
    )
    .join('')
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t('Thanks for your order'))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('Order #{number}', { number: order.orderNumber }))}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:13px;color:#6b7280">${escapeHtml(t('Subtotal'))}</td><td style="padding-top:12px;text-align:${end(lang)};font-size:13px">${money(order.subtotal, order.currency)}</td></tr>
      ${order.discountTotal ? `<tr><td style="font-size:13px;color:#6b7280">${escapeHtml(t('Discount'))}</td><td dir="ltr" style="text-align:${end(lang)};font-size:13px">-${money(order.discountTotal, order.currency)}</td></tr>` : ''}
      <tr><td style="font-size:13px;color:#6b7280">${escapeHtml(t('Delivery'))}</td><td style="text-align:${end(lang)};font-size:13px">${order.shippingTotal ? money(order.shippingTotal, order.currency) : escapeHtml(t('Free'))}</td></tr>
      ${order.taxTotal ? `<tr><td style="font-size:13px;color:#6b7280">${escapeHtml(t('Tax'))}</td><td style="text-align:${end(lang)};font-size:13px">${money(order.taxTotal, order.currency)}</td></tr>` : ''}
      <tr><td style="padding-top:8px;font-size:15px;font-weight:800">${escapeHtml(t('Total'))}</td><td style="padding-top:8px;text-align:${end(lang)};font-size:15px;font-weight:800">${money(order.grandTotal, order.currency)}</td></tr>
    </table>
    ${paymentNote ? `<p style="margin:20px 0 0;padding:12px 16px;background:#fdecea;border-radius:10px;font-size:14px;color:#121212">${paymentNote}</p>` : ''}
    ${addressLines.length ? `<p style="font-size:13px;font-weight:700;margin:20px 0 4px">${escapeHtml(t('Delivering to'))}</p><p style="font-size:13px;line-height:1.6;color:#3f3f46;margin:0">${addressLines.map(line => `<bdi>${escapeHtml(line)}</bdi>`).join('<br>')}</p>` : ''}
    ${issuedGiftCards.length ? `<table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px;margin-top:20px"><tr><td style="padding:16px 20px">
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">${escapeHtml(issuedGiftCards.length > 1 ? t('Your gift cards') : t('Your gift card'))}</p>
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>` : ''}
    ${url ? button(url, t('View your order'), brand) : ''}
  `, brand, lang)
  const text = [
    t('Thanks for your order #{number}. Total: {total}.', { number: order.orderNumber, total: money(order.grandTotal, order.currency) }),
    paymentNote.replace(/<[^>]+>/g, ''),
    giftCardText(t, issuedGiftCards, order.currency),
    url ? t('View your order: {url}', { url }) : '',
  ].filter(Boolean).join(' ')
  return sendEmail(order.email, t('Order confirmed — #{number}', { number: order.orderNumber }), html, text)
}

// "Gift card code: X (USD 25.00)." in the plain-text part of an email, or nothing.
function giftCardText(t: (text: string, vars?: Record<string, string | number>) => string, cards: any[], currency: string) {
  if (!cards.length) return ''
  const codes = cards.map((c: any) => `${c.code} (${money(c.balance, currency)})`).join(', ')
  return cards.length > 1 ? t('Gift card codes: {codes}.', { codes }) : t('Gift card code: {codes}.', { codes })
}

export async function sendFulfillmentEmail(orderId: string) {
  if (!(await settingEnabled('email.fulfillment'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return { sent: false, skipped: true }

  const lang = await langFor(order)
  const t = translator(lang)
  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t('Your order is on its way'))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('Order #{number} has shipped.', { number: order.orderNumber }))}</p>
    ${order.shippingMethod ? `<p style="font-size:13px;color:#6b7280;margin:0 0 6px">${escapeHtml(t('Delivery: {method}', { method: order.shippingMethod }))}</p>` : ''}
    ${order.trackingNumber ? `<p style="font-size:13px;color:#6b7280;margin:0 0 6px">${escapeHtml(t('Tracking number: {number}', { number: order.trackingNumber }))}</p>` : ''}
    ${url ? button(url, t('Track your order'), brand) : ''}
  `, brand, lang)
  const text = [
    t('Order #{number} has shipped.', { number: order.orderNumber }),
    order.trackingNumber ? t('Tracking number: {number}', { number: order.trackingNumber }) + '.' : '',
    url ? t('Track your order: {url}', { url }) : '',
  ].filter(Boolean).join(' ')
  return sendEmail(order.email, t('Your order has shipped — #{number}', { number: order.orderNumber }), html, text)
}

export async function sendDraftOrderInvoiceEmail(draftOrderId: string, payUrl: string) {
  const draft = await db.draftOrder.findUnique({ where: { id: draftOrderId }, include: { items: true } })
  if (!draft) return { sent: false, skipped: true }

  // Staff make invoices; the customer's language comes from their earlier orders.
  const lang = await customerLang({ email: draft.email })
  const t = translator(lang)
  const rows = draft.items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#121212">${escapeHtml(item.name)} <span style="color:#6b7280">&times; ${item.quantity}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:${end(lang)};color:#121212">${money(item.totalPrice, draft.currency)}</td>
    </tr>`
    )
    .join('')
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t('Invoice {number}', { number: draft.orderNumber }))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('Please review and pay to complete your order.'))}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
      <tr><td style="padding-top:12px;font-size:15px;font-weight:800">${escapeHtml(t('Total due'))}</td><td style="padding-top:12px;text-align:${end(lang)};font-size:15px;font-weight:800">${money(draft.grandTotal, draft.currency)}</td></tr>
    </table>
    ${button(payUrl, t('Review and pay'), brand)}
  `, brand, lang)
  const text = t('Invoice {number}. Total due: {total}. Pay online: {url}', { number: draft.orderNumber, total: money(draft.grandTotal, draft.currency), url: payUrl })
  return sendEmail(draft.email, t('Invoice for your order — {number}', { number: draft.orderNumber }), html, text)
}

export async function sendGiftCardIssuedEmail(giftCardId: string) {
  if (!(await settingEnabled('email.giftCard'))) return { sent: false, skipped: true }
  const card = await db.giftCard.findUnique({ where: { id: giftCardId } })
  if (!card || !card.customerId) return { sent: false, skipped: true }
  const customer = await db.user.findUnique({ where: { id: card.customerId } })
  if (!customer) return { sent: false, skipped: true }

  const lang = await customerLang({ userId: customer.id, email: customer.email })
  const t = translator(lang)
  const amount = money(card.initialAmount, card.currency)
  const expires = card.expiresAt ? new Date(card.expiresAt).toLocaleDateString(dateLocale(lang)) : ''
  const url = siteUrl() ? `${siteUrl()}/account` : null
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t("You've received a gift card"))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('{store} has issued you a gift card worth {amount}.', { store: brand.name, amount }))}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px"><tr><td dir="ltr" style="padding:16px 20px;font-size:18px;font-weight:800;letter-spacing:.04em;text-align:center">${escapeHtml(card.code)}</td></tr></table>
    ${expires ? `<p style="font-size:12px;color:#6b7280;margin:12px 0 0">${escapeHtml(t('Expires {date}.', { date: expires }))}</p>` : ''}
    ${url ? button(url, t('Use it at checkout'), brand) : ''}
  `, brand, lang)
  const text = [t("You've received a gift card worth {amount}. Code: {code}.", { amount, code: card.code }), expires ? t('Expires {date}.', { date: expires }) : ''].filter(Boolean).join(' ')
  return sendEmail(customer.email, t("You've received a {amount} gift card", { amount }), html, text)
}

const RETURN_STATUS_COPY: Record<string, (returnRequest: { id: string; refundAmount: number; notes: string | null }, orderNumber: string, currency: string, t: (text: string, vars?: Record<string, string | number>) => string) => { subject: string; heading: string; message: string }> = {
  APPROVED: (_returnRequest, orderNumber, _currency, t) => ({
    subject: t('Your return was approved — #{number}', { number: orderNumber }),
    heading: t('Your return was approved'),
    message: t("Please ship the items back to us. We'll process your return as soon as they arrive."),
  }),
  REJECTED: (returnRequest, orderNumber, _currency, t) => ({
    subject: t('Update on your return — #{number}', { number: orderNumber }),
    heading: t('Your return request was declined'),
    // The note is typed by staff, so it stays as they wrote it.
    message: returnRequest.notes ? `${t("We're unable to process this return.")} ${returnRequest.notes}` : t("We're unable to process this return. Contact us if you have questions."),
  }),
  RECEIVED: (returnRequest, orderNumber, _currency, t) => ({
    subject: t('We received your return — #{number}', { number: orderNumber }),
    heading: t('We received your return'),
    message: returnRequest.refundAmount > 0 ? t('Your items have arrived and your refund is being processed.') : t('Your items have arrived and your return has been processed.'),
  }),
  REFUNDED: (returnRequest, orderNumber, currency, t) => ({
    subject: t('Your refund has been issued — #{number}', { number: orderNumber }),
    heading: t('Your refund has been issued'),
    message: t('A refund of {amount} has been issued for order {number}.', { amount: money(returnRequest.refundAmount, currency), number: orderNumber }),
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
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true, lang: true } })
  if (!order) return { sent: false, skipped: true }

  const lang = await langFor(order)
  const t = translator(lang)
  const { subject, heading, message } = copy(returnRequest, order.orderNumber, order.currency, t)
  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(message)}</p>
    ${url ? button(url, t('View your order'), brand) : ''}
  `, brand, lang)
  const text = [`${heading}.`, message, url ? t('View your order: {url}', { url }) : ''].filter(Boolean).join(' ')
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
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true, lang: true } })
  if (!order) return { sent: false, skipped: true }

  const issuedGiftCards = issueGiftCards ? await issueGiftCardsForOrder(db, orderId) : []

  const lang = await langFor(order)
  const t = translator(lang)
  const amount = adjustment ? money(adjustment.amount, order.currency) : ''
  const heading = adjustment?.type === 'refund' ? t('Your order was updated — a refund is on its way')
    : adjustment?.type === 'charge' ? t('Your order was updated — additional payment required')
    : t('Your order was updated')
  const message = adjustment?.type === 'refund' ? t('Your order {number} was updated by our team. A refund of {amount} has been issued.', { number: order.orderNumber, amount })
    : adjustment?.type === 'charge' ? t("Your order {number} was updated by our team and now requires an additional payment of {amount}. We'll be in touch about how to complete it.", { number: order.orderNumber, amount })
    : t('Your order {number} was updated by our team.', { number: order.orderNumber })
  const url = orderLink(order.orderNumber, order.email, order.userId)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(message)}</p>
    ${issuedGiftCards.length ? `<table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px;margin-bottom:20px"><tr><td style="padding:16px 20px">
      <p style="font-size:13px;font-weight:700;margin:0 0 8px">${escapeHtml(issuedGiftCards.length > 1 ? t('Your gift cards') : t('Your gift card'))}</p>
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>` : ''}
    ${url ? button(url, t('View your order'), brand) : ''}
  `, brand, lang)
  const text = [`${heading}.`, message, giftCardText(t, issuedGiftCards, order.currency), url ? t('View your order: {url}', { url }) : ''].filter(Boolean).join(' ')
  return sendEmail(order.email, t('Your order was updated — {number}', { number: order.orderNumber }), html, text)
}

// Fired once a pending "additional payment required" charge from an order edit is later
// confirmed collected (admin marks the order PAID) -- mints any gift-card items that were
// deliberately withheld at edit-commit time and lets the customer know via the same template.
export async function issueAndNotifyGiftCardsForOrder(orderId: string) {
  if (!(await settingEnabled('email.orderEdit'))) return { sent: false, skipped: true }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { email: true, orderNumber: true, currency: true, userId: true, lang: true } })
  if (!order) return { sent: false, skipped: true }
  const issuedGiftCards = await issueGiftCardsForOrder(db, orderId)
  if (!issuedGiftCards.length) return { sent: false, skipped: true }

  const lang = await langFor(order)
  const t = translator(lang)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(issuedGiftCards.length > 1 ? t('Your gift cards are ready') : t('Your gift card is ready'))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('Payment for order {number} has been received.', { number: order.orderNumber }))}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;background:#f6f6f4;border-radius:8px"><tr><td style="padding:16px 20px">
      ${issuedGiftCards.map((c: any) => `<p style="font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px">${escapeHtml(c.code)} <span style="font-weight:400;color:#6b7280;font-size:12px">(${money(c.balance, order.currency)})</span></p>`).join('')}
    </td></tr></table>
  `, brand, lang)
  const text = [t('Payment for order {number} has been received.', { number: order.orderNumber }), giftCardText(t, issuedGiftCards, order.currency)].join(' ')
  return sendEmail(order.email, t('Your gift card is ready — {number}', { number: order.orderNumber }), html, text)
}

// "Notify me when it's back" (lib/back-in-stock.ts): the product the customer asked about.
export async function sendBackInStockEmail(to: string, product: { name: string; slug: string; image?: string }, lang: Lang = 'en') {
  const t = translator(lang)
  const base = siteUrl()
  const url = base ? `${base}/product/${encodeURIComponent(product.slug)}` : null
  const image = product.image && /^https:\/\//i.test(product.image) ? product.image : product.image?.startsWith('/') && base ? `${base}${product.image}` : ''
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t("It's back in stock"))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('You asked us to tell you when this is available again. Here it is, order it before it sells out.'))}</p>
    ${image ? `<img src="${escapeHtml(image)}" alt="" width="160" style="display:block;width:160px;max-width:100%;height:auto;border-radius:12px;margin:0 0 14px">` : ''}
    <p style="font-size:16px;font-weight:800;color:#121212;margin:0">${escapeHtml(product.name)}</p>
    ${url ? button(url, t('Shop it now'), brand) : ''}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">${escapeHtml(t('We only send this once, because you asked on our website.'))}</p>
  `, brand, lang)
  const text = [t('{name} is back in stock.', { name: product.name }), url ? t('Order it here: {url}', { url }) : ''].filter(Boolean).join(' ')
  return sendEmail(to, t('Back in stock: {name}', { name: product.name }), html, text)
}

// Sent by staff from the admin (needs Settings > Notifications > "Abandoned checkout recovery")
// or automatically by lib/cart-reminders.ts (needs its own switch, checked there). Both carry a
// link to stop these emails.
export async function sendAbandonedCheckoutEmail(abandonedCheckoutId: string, options: { automatic?: boolean; unsubscribeUrl?: string; oneClickUnsubscribeUrl?: string } = {}) {
  if (!options.automatic && !(await settingEnabled('email.abandonedCheckout'))) return { sent: false, skipped: true }
  const checkout = await db.abandonedCheckout.findUnique({ where: { id: abandonedCheckoutId } })
  if (!checkout || !checkout.email) return { sent: false, skipped: true }

  const lang = await langFor({ lang: checkout.lang, userId: checkout.customerId, email: checkout.email })
  const t = translator(lang)
  let items: Array<{ name?: string; quantity?: number; unitPrice?: number }> = []
  try { items = JSON.parse(checkout.cartJson) } catch { items = [] }
  const rows = items
    .map(
      (item) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#121212">${escapeHtml(String(item.name || t('Item')))} <span style="color:#6b7280">&times; ${Number(item.quantity) || 1}</span></td>
      <td style="padding:8px 0;font-size:13px;text-align:${end(lang)};color:#121212">${money((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1), checkout.currency)}</td>
    </tr>`
    )
    .join('')
  const url = checkout.recoveryUrl || (siteUrl() ? `${siteUrl()}/checkout` : null)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(t('You left something in your cart'))}</h1>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 20px">${escapeHtml(t('Pick up right where you left off.'))}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    ${checkout.subtotal ? `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px"><tr><td style="padding-top:12px;font-size:15px;font-weight:800">${escapeHtml(t('Subtotal'))}</td><td style="padding-top:12px;text-align:${end(lang)};font-size:15px;font-weight:800">${money(checkout.subtotal, checkout.currency)}</td></tr></table>` : ''}
    ${url ? button(url, t('Complete your order'), brand) : ''}
    ${options.unsubscribeUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${escapeHtml(t("Don't want cart reminders?"))} <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6b7280">${escapeHtml(t('Stop these emails'))}</a>.</p>` : ''}
  `, brand, lang)
  const text = `${t('You left items in your cart.')}${url ? ` ${t('Complete your order: {url}', { url })}` : ''}${options.unsubscribeUrl ? `\n\n${t('Stop cart reminder emails: {url}', { url: options.unsubscribeUrl })}` : ''}`
  // List-Unsubscribe: Gmail and others show their own "Unsubscribe" button, which posts to it.
  const headers = options.oneClickUnsubscribeUrl ? { 'List-Unsubscribe': `<${options.oneClickUnsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  return sendEmail(checkout.email, t('You left something in your cart'), html, text, headers ? { headers } : undefined)
}

// "How was your order?" -- sent by the morning job (/api/internal/daily) a day after delivery,
// once per order, to orders placed with an email. The button opens app/review/[orderNumber].
export async function sendReviewRequestEmail(order: { email: string; orderNumber: string; firstName: string; products: Array<{ name: string; image: string }>; lang?: string | null; userId?: string | null }, reviewUrl: string) {
  const lang = await langFor(order)
  const t = translator(lang)
  const brand = await emailBrand()
  const products = order.products.slice(0, 4).map(p => `<tr>
      <td width="56" style="padding:8px 12px 8px 0">${/^https:\/\//i.test(p.image) ? `<img src="${escapeHtml(p.image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:0">` : ''}</td>
      <td style="padding:8px 0;font-size:14px;color:#121212">${escapeHtml(p.name)}</td>
    </tr>`).join('')
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(order.firstName ? t('How was your order, {name}?', { name: order.firstName }) : t('How was your order?'))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 16px">${escapeHtml(t('Thank you for shopping with {store}. We hope you like order #{number}. Could you rate what you bought? It takes 30 seconds and helps other customers choose.', { store: brand.name, number: order.orderNumber }))}</p>
    ${products ? `<table role="presentation" width="100%" style="border-collapse:collapse">${products}</table>` : ''}
    ${button(reviewUrl, t('Rate my order'), brand)}
  `, brand, lang)
  const text = t('How was your order #{number}? Rate what you bought (30 seconds): {url}', { number: order.orderNumber, url: reviewUrl })
  return sendEmail(order.email, t('How was your order #{number}?', { number: order.orderNumber }), html, text)
}

// "Running low?" (lib/refill-reminders.ts): some time after delivery, what the customer may need again, with the link
// that puts it back in their cart. Not queued for retries: a reminder that could not go out is tried on a later morning.
export async function sendRefillReminderEmail(to: string, reminder: { firstName: string; products: Array<{ name: string; image: string }>; url: string; stopUrl: string; oneClickStopUrl: string; lang: Lang }) {
  const { lang } = reminder
  const t = translator(lang)
  const brand = await emailBrand()
  const names = reminder.products.map(p => p.name)
  const rows = reminder.products.slice(0, 4).map(p => `<tr>
      <td width="56" style="padding:8px 0">${/^https:\/\//i.test(p.image) ? `<img src="${escapeHtml(p.image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:0">` : ''}</td>
      <td style="padding:8px 12px;font-size:14px;color:#121212">${escapeHtml(p.name)}</td>
    </tr>`).join('')
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(reminder.firstName ? t('Running low, {name}?', { name: reminder.firstName }) : t('Running low?'))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 16px">${escapeHtml(t("It may be time to stock up again. Put it back in your cart in one tap, at today's prices."))}</p>
    ${rows ? `<table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>` : ''}
    ${button(reminder.url, t('Order again'), brand)}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">${escapeHtml(t('We send this once for each order.'))} <a href="${escapeHtml(reminder.stopUrl)}" style="color:#6b7280">${escapeHtml(t('Stop these reminders'))}</a>.</p>
  `, brand, lang)
  const text = [t('Running low on {products}? Order again in one tap: {url}', { products: names.join(', '), url: reminder.url }), t('Stop these reminders: {url}', { url: reminder.stopUrl })].join('\n\n')
  const subject = names.length === 1 ? t('Running low on {name}?', { name: names[0] }) : t('Running low?')
  return sendEmail(to, subject, html, text, { headers: { 'List-Unsubscribe': `<${reminder.oneClickStopUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, retry: false })
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

// Sign-up: confirm the address. Sent to every new sign-up, so the sign-up itself reveals nothing.
export async function sendEmailVerificationEmail(to: string, verifyUrl: string, hours: number, lang: Lang = 'en') {
  const t = translator(lang)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(t('Confirm your email'))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46">${escapeHtml(t('Thanks for creating an account. Confirm this address to finish; the link expires in {hours} hours.', { hours }))}</p>
    ${button(verifyUrl, t('Confirm email'), brand)}
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">${escapeHtml(t('If you did not create an account, you can ignore this email.'))}</p>
  `, brand, lang)
  const text = t('Confirm your email: {url} (expires in {hours} hours). If you did not create an account, ignore this email.', { url: verifyUrl, hours })
  return sendEmail(to, t('Confirm your email'), html, text)
}

// Sign-up with an address that already has an account: tells the owner of that address, and
// gives them the way to sign in or reset the password. Nothing is created.
export async function sendAlreadyRegisteredEmail(to: string, loginUrl: string, resetUrl: string, lang: Lang = 'en') {
  const t = translator(lang)
  const brand = await emailBrand()
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(t('You already have an account'))}</h1>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46">${escapeHtml(t('Someone tried to create an account with this email address. If that was you, sign in, or reset your password if you have forgotten it.'))}</p>
    ${button(loginUrl, t('Sign in'), brand)}
    <p style="font-size:14px;line-height:1.6;margin:16px 0 0"><a href="${escapeHtml(resetUrl)}">${escapeHtml(t('Reset your password'))}</a></p>
    <p style="font-size:12px;color:#6b7280;margin:24px 0 0">${escapeHtml(t('If this was not you, you can ignore this email.'))}</p>
  `, brand, lang)
  const text = t('You already have an account. Sign in: {login} . Reset your password: {reset} . If this was not you, ignore this email.', { login: loginUrl, reset: resetUrl })
  return sendEmail(to, t('You already have an account'), html, text)
}
