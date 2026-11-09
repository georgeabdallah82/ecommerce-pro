// Pickup points for the "Our stores" page. Entered by the owner in Settings, one per line:
//   Name | Address | Opening hours | Phone
// Blank lines and lines without a name are ignored; a missing part is left empty.

export type StoreRow = { name: string; address: string; hours: string; phone: string }

export function parseStores(text: string | null | undefined, limit = 20): StoreRow[] {
  return (text || '').split('\n')
    .map(line => line.split('|').map(part => part.replace(/[\u0000-\u001f]/g, '').trim()))
    .filter(parts => parts[0])
    .slice(0, limit)
    .map(([name, address = '', hours = '', phone = '']) => ({ name: name.slice(0, 80), address: address.slice(0, 160), hours: hours.slice(0, 160), phone: phone.slice(0, 25) }))
}

// Phone links keep digits and a leading +; anything else is dropped.
export function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.length >= 6 ? `tel:${digits}` : ''
}
