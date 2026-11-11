import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { canViewOrder } from '@/lib/order-access'
import { MAX_PROOF_BYTES, MAX_PROOFS_PER_ORDER, PROOF_MESSAGES, proofState, readProofForm, sniffProofType } from '@/lib/payment-proof'
import { deletePaymentProof, savePaymentProof } from '@/lib/payment-proof-storage'
import { sendPaymentProofPush } from '@/lib/push'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
// The picture plus room for the form fields around it.
const FORM_LIMIT = MAX_PROOF_BYTES + 64 * 1024

// "I paid by transfer": the customer adds a screenshot of the transfer from the thank-you page or
// their order page. Proved like the other order pages (the view code, the order's email, or the
// signed-in owner, lib/order-access.ts); the file is checked by what it really is, kept in private
// storage, and staff see it on the order (lib/payment-proof.ts).
export async function POST(req: Request) {
  let savedKey = ''
  try {
    // Refuse a declared size over the limit before reading anything.
    if (Number(req.headers.get('content-length') || 0) > MAX_PROOF_BYTES + 64 * 1024) return json({ error: PROOF_MESSAGES.tooBig }, { status: 413, headers: NO_STORE })

    // The per-address limit is charged before the body is read, so a flood costs one counter per request.
    const ip = await consumeDurableRateLimit(`payment-proof:ip:${clientIp(req.headers)}`, 15, 15 * 60 * 1000)
    if (!ip.allowed) return json({ error: PROOF_MESSAGES.slow }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.max(ip.retryAfterSeconds, 60)) } })

    // The body is read only up to the limit, whatever its Content-Length says.
    const form = await readProofForm(req, FORM_LIMIT)
    if (form === 'too-big') return json({ error: PROOF_MESSAGES.tooBig }, { status: 413, headers: NO_STORE })
    if (!form) return json({ error: PROOF_MESSAGES.file }, { status: 400, headers: NO_STORE })
    const orderNumber = String(form.get('orderNumber') || '').trim().slice(0, 80)
    if (!orderNumber) return json({ error: PROOF_MESSAGES.notFound }, { status: 404, headers: NO_STORE })

    const user = await getCurrentUser().catch(() => null)
    const order = await db.order.findUnique({ where: { orderNumber }, include: { paymentProofs: { select: { id: true } } } })
    // Same answer whether the order exists or the proof of ownership is wrong.
    const token = form.get('t'), email = form.get('email')
    if (!order || !canViewOrder(order, { userId: user?.id, token: typeof token === 'string' ? token : null, email: typeof email === 'string' ? email : null })) return json({ error: PROOF_MESSAGES.notFound }, { status: 404, headers: NO_STORE })

    // The per-order limit is charged only once ownership is proved, so guessing order numbers cannot use up an order's allowance.
    const perOrder = await consumeDurableRateLimit(`payment-proof:order:${orderNumber}`, 8, 60 * 60 * 1000)
    if (!perOrder.allowed) return json({ error: PROOF_MESSAGES.slow }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.max(perOrder.retryAfterSeconds, 60)) } })

    const state = proofState(order, order.paymentProofs.length)
    if (!state.allowed) return json({ error: PROOF_MESSAGES[state.reason] }, { status: 400, headers: NO_STORE })

    const file = form.get('file')
    if (!file || typeof file === 'string' || typeof (file as File).arrayBuffer !== 'function') return json({ error: PROOF_MESSAGES.file }, { status: 400, headers: NO_STORE })
    if ((file as File).size > MAX_PROOF_BYTES) return json({ error: PROOF_MESSAGES.tooBig }, { status: 400, headers: NO_STORE })
    const bytes = new Uint8Array(await (file as File).arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROOF_BYTES) return json({ error: bytes.byteLength ? PROOF_MESSAGES.tooBig : PROOF_MESSAGES.file }, { status: 400, headers: NO_STORE })
    const type = sniffProofType(bytes)
    if (!type) return json({ error: PROOF_MESSAGES.file }, { status: 400, headers: NO_STORE })

    const stored = await savePaymentProof(bytes, type)
    savedKey = stored.key
    // Re-check the limit while saving. The order row is locked first, so a second upload at the same moment waits
    // here and then counts the first one. This is the same lock the checkout takes for wallet and coin payments.
    const saved = await db.$transaction(async tx => {
      await tx.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } })
      const count = await tx.paymentProof.count({ where: { orderId: order.id } })
      if (count >= MAX_PROOFS_PER_ORDER) return null
      await tx.paymentProof.create({ data: { orderId: order.id, key: stored.key, contentType: stored.contentType, sizeBytes: stored.sizeBytes } })
      return { count: count + 1 }
    })
    if (!saved) { await deletePaymentProof(stored.key); savedKey = ''; return json({ error: PROOF_MESSAGES.limit }, { status: 400, headers: NO_STORE }) }
    savedKey = ''

    await audit(null, 'order.payment_proof_uploaded', 'Order', order.id, { via: user ? 'account' : 'guest', bytes: stored.sizeBytes })
    runInBackground(sendPaymentProofPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[payment-proof] push failed', error)))
    return json({ ok: true, count: saved.count }, { headers: NO_STORE })
  } catch (error) {
    if (savedKey) await deletePaymentProof(savedKey).catch(() => {})
    console.error('[orders/payment-proof] unexpected failure', error)
    return json({ error: PROOF_MESSAGES.failed }, { status: 500, headers: NO_STORE })
  }
}
