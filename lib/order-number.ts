import { db } from '@/lib/prisma'

// Order numbers are short and counted up: 1001, 1002, 1003... (shown as #1001). Every new order
// takes the next one, whether it comes from checkout, an admin manual order or a draft order.
// The counter is one row ("order") in the Counter table, raised in a single statement so two
// orders placed at the same moment never get the same number. Orders placed before this keep
// their old numbers (ORD-...). If a checkout fails after taking its number, that number is
// simply skipped.
export const ORDER_COUNTER = 'order'
export const FIRST_ORDER_NUMBER = 1001

type RawClient = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> }

export async function nextOrderNumber(client: RawClient = db): Promise<string> {
  try {
    const rows = await client.$queryRaw<{ value: unknown }[]>`
      INSERT INTO "Counter" ("name", "value", "updatedAt") VALUES (${ORDER_COUNTER}, ${FIRST_ORDER_NUMBER}, CURRENT_TIMESTAMP)
      ON CONFLICT ("name") DO UPDATE SET "value" = "Counter"."value" + 1, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "value"`
    const value = Number(Array.isArray(rows) ? rows[0]?.value : NaN)
    if (Number.isSafeInteger(value) && value > 0) return String(value)
  } catch (error) {
    // Never block an order over its number: fall back to the long format below.
    console.error('[orders] order counter unavailable; using a long order number', error)
  }
  return newOrderNumber()
}

// The old long format, kept only as a fallback if the counter can't be read (the offline
// development store has no counter): ORD-<time in base 36>-<4 random characters>. The alphabet
// skips 0/O and 1/I so a number can be read out over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newOrderNumber(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `ORD-${now.toString(36).toUpperCase()}-${Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')}`
}
