import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { readPaymentProof } from '@/lib/payment-proof-storage'
import { json } from '@/lib/utils'

// Staff only: shows a payment screenshot on its order. It is never public, never cached by shared
// caches, and served as an inert picture (the headers stop it running as a page).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; proofId: string }> }) {
  try {
    await requirePermission('orders.view')
    const { id, proofId } = await params
    const proof = await db.paymentProof.findFirst({ where: { id: proofId, orderId: id } })
    if (!proof) return new Response('Not found', { status: 404 })
    const file = await readPaymentProof(proof.key)
    if (!file) return new Response('Not found', { status: 404 })
    return new Response(file.body as BodyInit, { headers: {
      'content-type': file.contentType,
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    } })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    return json({ error: 'Unable to load the screenshot' }, { status: 500 })
  }
}
