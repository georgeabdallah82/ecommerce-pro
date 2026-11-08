// Turns the till's errors into responses. A problem with the cashier's input is a 400 with its message;
// a database refusal is a 503 asking to retry; anything else is logged and answered generically.
import { SaleError } from '@/lib/pos-sale'
import { ShiftError } from '@/lib/pos-shifts'
import { ReturnError } from '@/lib/pos-returns'
import { TransactionUnavailableError } from '@/lib/prisma'
import { json } from '@/lib/utils'

export function tillFailure(error: unknown, what: string) {
  if (error instanceof ShiftError || error instanceof SaleError || error instanceof ReturnError) return json({ error: error.message }, { status: 400 })
  if (error instanceof TransactionUnavailableError) return json({ error: error.message }, { status: 503 })
  console.error(`[pos] ${what} failed`, error)
  return json({ error: `The ${what} could not be saved. Please try again.` }, { status: 500 })
}
