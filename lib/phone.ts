// Phone numbers as international digits ("96170123456"), the form WhatsApp links, ad-platform
// matching and the blocked-numbers list all need. Customers type them every way: "70 123 456",
// "03/123456", "+961 70 123 456", "00961 70123456". Local numbers (8 digits or fewer, the
// Lebanese length) get the store country's code when the store is in Lebanon.
export function isLebanon(country: string | null | undefined) {
  const c = String(country || '').trim().toLowerCase()
  return c === '' || c === 'lebanon' || c === 'lb' || c === 'lbn'
}

export function internationalPhone(phone: string | null | undefined, storeCountry?: string | null) {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '')
  if (!digits) return ''
  if (isLebanon(storeCountry)) {
    if (digits.length <= 9 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length <= 8) digits = `961${digits}`
    else if (digits.startsWith('9610')) digits = `961${digits.slice(4)}`
  }
  // A Lebanese number is 961 and 7 digits (03 123456) or 8 (70 123456); fewer or more is a typo
  // that WhatsApp would open as "this number isn't on WhatsApp".
  if (digits.startsWith('961') && (digits.length < 10 || digits.length > 11)) return ''
  return digits.length >= 8 && digits.length <= 15 ? digits : ''
}
