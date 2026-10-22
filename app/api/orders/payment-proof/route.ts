import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { canViewOrder } from '@/lib/order-access'
import { MAX_PROOF_BYTES, PROOF_MESSAGES, proofState, sniffProofType } from '@/lib/payment-proof'
import { deletePaymentProof, savePaymentProof } from '@/lib/payment-proof-storage'
import { sendPaymentProofPush } from '@/lib/push'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// "I paid by transfer": the customer adds a screenshot of the transfer from the thank-you page or
// their order page. Proved like the other order pages (the view code, the order's email, or the
// signed-in owner, lib/order-access.ts); the file is checked by what it really is, kept in private
// storage, and staff see it on the order (lib/payment-proof.ts).
export async function POST(req: Request) {
  let savedKey = ''
  try {
    // Refuse a huge body before reading it (a little room for the form fields around the picture).
    if (Number(req.headers.get('content-length') || 0) > MAX_PROOF_BYTES + 64 * 1024) return json({ error: PROOF_MESSAGES.tooBig }, { status: 413, headers: NO_STORE })
    const form = await req.formData().catch(() => null)
    if (!form) return json({ error: PROOF_MESSAGES.file }, { status: 400, headers: NO_STORE })
    const orderNumber = String(form.get('orderNumber') || '').trim().slice(0, 80)
    if (!orderNumber) return json({ error: PROOF_MESSAGES.notFound }, { status: 404, headers: NO_STORE })

    const ip = await consumeDurableRateLimit(`payment-proof:ip:${clientIp(req.headers)}`, 15, 15 * 60 * 1000)
    const perOrder = await consumeDurableRateLimit(`payment-proof:order:${orderNumber}`, 8, 60 * 60 * 1000)
    if (!ip.allowed || !perOrder.allowed) return json({ error: PROOF_MESSAGES.slow }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.max(ip.retryAfterSeconds, perOrder.retryAfterSeconds, 60)) } })

    const user = await getCurrentUser().catch(() => null)
    const order = await db.order.findUnique({ where: { orderNumber }, include: { paymentProofs: { select: { id: true } } } })
    // Same answer whether the order exists or the proof of ownership is wrong.
    const token = form.get('t'), email = form.get('email')
    if (!order || !canViewOrder(order, { userId: user?.id, token: typeof token === 'string' ? token : null, email: typeof email === 'string' ? email : null })) return json({ error: PROOF_MESSAGES.notFound }, { status: 404, headers: NO_STORE })
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
    // Re-check the limit while saving: two uploads at the same moment cannot both squeeze in.
    const proof = await db.$transaction(async tx => {
      const count = await tx.paymentProof.count({ where: { orderId: order.id } })
      if (count >= 3) return null
      return tx.paymentProof.create({ data: { orderId: order.id, key: stored.key, contentType: stored.contentType, sizeBytes: stored.sizeBytes } })
    })
    if (!proof) { await deletePaymentProof(stored.key); savedKey = ''; return json({ error: PROOF_MESSAGES.limit }, { status: 400, headers: NO_STORE }) }
    savedKey = ''

    await audit(null, 'order.payment_proof_uploaded', 'Order', order.id, { via: user ? 'account' : 'guest', bytes: stored.sizeBytes })
    runInBackground(sendPaymentProofPush({ id: order.id, orderNumber: order.orderNumber, grandTotal: order.grandTotal, currency: order.currency }).catch(error => console.error('[payment-proof] push failed', error)))
    return json({ ok: true, count: order.paymentProofs.length + 1 }, { headers: NO_STORE })
  } catch (error) {
    if (savedKey) await deletePaymentProof(savedKey).catch(() => {})
    console.error('[orders/payment-proof] unexpected failure', error)
    return json({ error: PROOF_MESSAGES.failed }, { status: 500, headers: NO_STORE })
  }
}
