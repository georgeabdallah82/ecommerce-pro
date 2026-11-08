import { requirePermission } from '@/lib/auth'
import { tillFailure } from '@/lib/pos-http'
import { findReceiptForReturn, recordPosReturn } from '@/lib/pos-returns'
import { json } from '@/lib/utils'

// Find a till receipt to return from. Needs the permission to refund.
export async function GET(req: Request) {
  try {
    await requirePermission('orders.refund')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  const receipt = new URL(req.url).searchParams.get('receipt')?.trim() ?? ''
  if (!/^[A-Za-z0-9-]{3,40}$/.test(receipt)) return json({ error: 'Enter the receipt number.' }, { status: 400 })
  const found = await findReceiptForReturn(receipt)
  if (!found) return json({ error: 'No till receipt has that number.' }, { status: 404 })
  return json(found, { headers: { 'Cache-Control': 'no-store' } })
}

// Record a return and its refund. The server checks quantities, the shift and the refund again.
export async function POST(req: Request) {
  let actor
  try {
    actor = await requirePermission('orders.refund')
  } catch {
    return json({ error: 'Forbidden' }, { status: 403 })
  }
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The return could not be read. Try again.' }, { status: 400 })
  }
  try {
    const result = await recordPosReturn({
      receiptNumber: body.receiptNumber,
      reason: body.reason,
      refundMethod: body.refundMethod,
      lines: Array.isArray(body.lines) ? (body.lines as Array<Record<string, unknown>>).map(line => ({ orderItemId: line.orderItemId, quantity: line.quantity, condition: line.condition })) : [],
    }, actor.id)
    return json(result, { status: 201 })
  } catch (error) {
    return tillFailure(error, 'return')
  }
}
