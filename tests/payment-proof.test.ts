import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MAX_PROOFS_PER_ORDER, MAX_PROOF_BYTES, PROOF_MESSAGES, isProofKey, proofState, sniffProofType } from '@/lib/payment-proof'

const read = (path: string) => readFileSync(path, 'utf8')
const order = { paymentMethod: 'WALLET', paymentStatus: 'UNPAID', status: 'PENDING' }
const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('payment proof: when a screenshot can be added', () => {
  it('allows bank and wallet transfers that are not paid yet, up to the limit', () => {
    assert.deepEqual(proofState(order, 0), { allowed: true })
    assert.deepEqual(proofState({ ...order, paymentMethod: 'BANK_TRANSFER' }, MAX_PROOFS_PER_ORDER - 1), { allowed: true })
    assert.deepEqual(proofState({ ...order, paymentStatus: 'PENDING' }, 0), { allowed: true })
  })
  it('refuses cash on delivery, card, paid, refunded and closed orders, and a full order', () => {
    assert.deepEqual(proofState({ ...order, paymentMethod: 'COD' }, 0), { allowed: false, reason: 'method' })
    assert.deepEqual(proofState({ ...order, paymentMethod: 'CARD' }, 0), { allowed: false, reason: 'method' })
    assert.deepEqual(proofState({ ...order, paymentStatus: 'PAID' }, 0), { allowed: false, reason: 'paid' })
    assert.deepEqual(proofState({ ...order, paymentStatus: 'REFUNDED' }, 0), { allowed: false, reason: 'paid' })
    assert.deepEqual(proofState({ ...order, status: 'CANCELLED' }, 0), { allowed: false, reason: 'closed' })
    assert.deepEqual(proofState(order, MAX_PROOFS_PER_ORDER), { allowed: false, reason: 'limit' })
  })
  it('has a plain sentence for every refusal', () => {
    for (const reason of ['method', 'paid', 'closed', 'limit'] as const) assert.ok(PROOF_MESSAGES[reason].length > 10)
    assert.equal(MAX_PROOF_BYTES, 5 * 1024 * 1024)
  })
})

describe('payment proof: only real pictures are kept', () => {
  it('recognises JPG, PNG and WebP by their first bytes', () => {
    assert.equal(sniffProofType(bytes(0xff, 0xd8, 0xff)), 'jpg')
    assert.equal(sniffProofType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'png')
    assert.equal(sniffProofType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])), 'webp')
  })
  it('refuses scripts, pages, SVG, GIF and anything else, whatever the file is called', () => {
    const text = (s: string) => new TextEncoder().encode(s)
    assert.equal(sniffProofType(text('<script>alert(1)</script>')), null)
    assert.equal(sniffProofType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
    assert.equal(sniffProofType(text('GIF89a......')), null)
    assert.equal(sniffProofType(text('%PDF-1.7')), null)
    assert.equal(sniffProofType(new Uint8Array([])), null)
    assert.equal(sniffProofType(new Uint8Array([0xff, 0xd8])), null)
    assert.equal(sniffProofType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null) // a WAV, not a WebP
  })
  it('only reads and serves storage keys of the exact private shape', () => {
    assert.ok(isProofKey('proof-0123456789abcdef0123456789abcdef.png'))
    for (const bad of ['', 'proof-123.png', '../proof-0123456789abcdef0123456789abcdef.png', 'proof-0123456789abcdef0123456789abcdef.svg', 'proof-0123456789abcdef0123456789abcdeg.png', '1700000000-abc123.png', 'proof-0123456789abcdef0123456789abcdef.png/x', null, undefined, 42]) assert.equal(isProofKey(bad), false, String(bad))
  })
})

describe('payment proof: private by design', () => {
  it('is never served by the public media route', () => {
    assert.match(read('app/api/media/[key]/route.ts'), /key\.startsWith\('proof-'\)\) return new Response\('Not found', \{ status: 404 \}\)/)
  })
  it('is shown to staff only, never cached by shared caches', () => {
    const route = read('app/api/admin/orders/[id]/payment-proof/[proofId]/route.ts')
    assert.match(route, /requirePermission\('orders\.view'\)/)
    assert.match(route, /'cache-control': 'private, no-store'/)
    assert.match(route, /sandbox/)
    assert.match(route, /findFirst\(\{ where: \{ id: proofId, orderId: id \} \}\)/) // the picture must belong to that order
  })
  it('is added only by someone who can prove the order is theirs, with limits', () => {
    const route = read('app/api/orders/payment-proof/route.ts')
    assert.match(route, /canViewOrder\(order, \{ userId: user\?\.id, token:/)
    assert.match(route, /consumeDurableRateLimit\(`payment-proof:ip:/)
    assert.match(route, /consumeDurableRateLimit\(`payment-proof:order:/)
    assert.match(route, /sniffProofType\(bytes\)/)
    assert.match(route, /proofState\(order,/)
    assert.match(route, /Number\(req\.headers\.get\('content-length'\) \|\| 0\) > MAX_PROOF_BYTES/)
  })
})

describe('payment proof: the database change only adds', () => {
  it('creates one new table and touches nothing that exists', () => {
    const sql = read('prisma/migrations/20261025000000_payment_proofs/migration.sql')
    const statements = sql.split(';').map(x => x.replace(/--.*$/gm, '').trim()).filter(Boolean)
    assert.equal(statements.length, 4)
    assert.match(statements[0], /^CREATE TABLE "PaymentProof"/)
    assert.match(statements[1], /^CREATE UNIQUE INDEX "PaymentProof_key_key"/)
    assert.match(statements[2], /^CREATE INDEX "PaymentProof_orderId_idx"/)
    assert.match(statements[3], /^ALTER TABLE "PaymentProof" ADD CONSTRAINT/)
    assert.doesNotMatch(sql, /DROP |TRUNCATE|DELETE FROM|UPDATE "/)
    assert.match(read('prisma/schema.prisma'), /paymentProofs\s+PaymentProof\[\]/)
  })
  it('is wired into the thank-you page, the order page and the admin order page, with wallet instructions', () => {
    assert.match(read('app/order/success/page.tsx'), /<PaymentProofBox orderNumber=\{record\.orderNumber\}/)
    assert.match(read('app/account/orders/[orderNumber]/page.tsx'), /<PaymentProofBox orderNumber=\{order\.orderNumber\}/)
    assert.match(read('components/order-detail-admin.tsx'), /payment-proof\/\$\{p\.id\}/)
    assert.match(read('components/payment-instructions.tsx'), /method === 'WALLET'/)
  })
})
