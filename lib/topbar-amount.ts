// The top bar says "Free delivery on orders over $50". The amount a shopper really needs is set in
// Settings > Checkout, so when a top-bar message mentions exactly one amount and talks about free
// delivery, that amount is shown as the store's real one: the two can never disagree. Messages with
// several amounts ("over $50, or $5 off your first order") are left as written.
// Built from a string with \u escapes: a raw euro or pound sign in a regex literal would stay raw in the
// server bundle (scripts/check-worker-charset.mjs).
const AMOUNT = new RegExp('(?:[$\\u20ac\\u00a3]\\s?\\d+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?\\s?(?:\\$|usd\\b|dollars?\\b))', 'gi')

export function syncFreeDeliveryAmount(text: string, formatted: string): string {
  if (!formatted || !/free/i.test(text)) return text
  const found = text.match(AMOUNT) || []
  if (found.length !== 1) return text
  return text.replace(AMOUNT, formatted)
}
