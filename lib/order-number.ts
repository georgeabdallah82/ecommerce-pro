// One format for every order (checkout, draft orders, manual admin orders):
// ORD-<time in base 36>-<4 random characters>. The alphabet skips 0/O and 1/I so customers
// can read a number out over the phone; 32 symbols keep the random bytes unbiased.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newOrderNumber(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `ORD-${now.toString(36).toUpperCase()}-${Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')}`
}
