// What is saved from a chat (Admin › AI assistant › Conversations) leaves out contact details a
// shopper typed: emails, phone numbers and card-like numbers become [email], [phone], [card].
// Order numbers (ORD-...) stay, so the owner can follow up. The live answer is not affected.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// 13-19 digits, maybe split by spaces or dashes: a card number.
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g
// 7 or more digits with the usual phone separators, maybe starting with +.
const PHONE = /(?<![A-Z0-9-])\+?\d(?:[\d\s().-]{5,18})\d(?![A-Z0-9-])/gi

export function redact(text: string) {
  return String(text || '')
    .replace(EMAIL, '[email]')
    .replace(CARD, match => (match.replace(/\D/g, '').length >= 13 ? '[card]' : match))
    .replace(PHONE, match => (match.replace(/\D/g, '').length >= 7 ? '[phone]' : match))
}

// Live chat with a person (lib/live-chat/server.ts): the shopper is talking to the store, like on
// WhatsApp, and may give a phone number or email on purpose so the store can follow up; only
// card-like numbers are hidden.
export function redactCards(text: string) {
  return String(text || '').replace(CARD, match => (match.replace(/\D/g, '').length >= 13 ? '[card]' : match))
}
