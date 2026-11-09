// The wholesale / bulk-order form on the storefront (/wholesale). Rules for what is accepted; the
// route writes the inquiry and tells the store's contact address.

export type WholesaleInput = {
  businessName: string
  contactName: string
  email: string
  phone: string
  city: string
  interest: string
  message: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^\+?[0-9 ()-]{6,25}$/

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : ''
}

export function cleanWholesaleInput(body: unknown): { data: WholesaleInput } | { error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const data: WholesaleInput = {
    businessName: text(b.businessName, 120),
    contactName: text(b.contactName, 80),
    email: text(b.email, 120).toLowerCase(),
    phone: text(b.phone, 25),
    city: text(b.city, 80),
    interest: text(b.interest, 500),
    message: text(b.message, 1000),
  }
  if (data.businessName.length < 2) return { error: 'Tell us the business name' }
  if (data.contactName.length < 2) return { error: 'Tell us who we should contact' }
  if (!EMAIL.test(data.email)) return { error: 'Enter a valid email address' }
  if (!PHONE.test(data.phone)) return { error: 'Enter a phone number we can call or message' }
  return { data }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

// The message the store's contact address receives (plain text and HTML).
export function wholesaleEmail(input: WholesaleInput) {
  const rows: Array<[string, string]> = [
    ['Business', input.businessName], ['Contact', input.contactName], ['Email', input.email], ['Phone', input.phone],
    ['City', input.city], ['Interested in', input.interest], ['Message', input.message],
  ]
  const present = rows.filter(([, v]) => v)
  const subject = `Wholesale inquiry: ${input.businessName}`
  const text = present.map(([k, v]) => `${k}: ${v}`).join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${present.map(([k, v]) => `<p style="margin:0 0 8px"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
  return { subject, text, html }
}
