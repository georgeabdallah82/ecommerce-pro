import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'node:crypto'
import { getMediaBucket } from '@/lib/media-storage'
import { PROOF_CONTENT_TYPES, PROOF_KEY_PREFIX, isProofKey, type ProofType } from '@/lib/payment-proof'

// Private storage for payment screenshots. They go in the same R2 bucket as the store's pictures
// but are never given a public address: only the admin route (app/api/admin/orders/[id]/payment-proof)
// reads them back, and only for signed-in staff. Without an R2 binding (plain `next dev`) they are
// written to a folder outside public/, and production refuses to run without R2.
const LOCAL_DIR = () => path.join(process.cwd(), '.private-uploads')

export async function savePaymentProof(bytes: Uint8Array, type: ProofType) {
  const key = `${PROOF_KEY_PREFIX}${randomBytes(16).toString('hex')}.${type}`
  const contentType = PROOF_CONTENT_TYPES[type]
  const bucket = await getMediaBucket()
  if (bucket) await bucket.put(key, bytes, { httpMetadata: { contentType } })
  else if (process.env.NODE_ENV === 'production') throw new Error('File uploads are not configured for this deployment.')
  else { await mkdir(LOCAL_DIR(), { recursive: true }); await writeFile(path.join(LOCAL_DIR(), key), bytes) }
  return { key, contentType, sizeBytes: bytes.byteLength }
}

export async function readPaymentProof(key: string): Promise<{ body: ReadableStream | Uint8Array; contentType: string } | null> {
  if (!isProofKey(key)) return null
  const bucket = await getMediaBucket()
  if (bucket) {
    const object = await bucket.get(key)
    return object ? { body: object.body, contentType: object.httpMetadata?.contentType || 'image/jpeg' } : null
  }
  try { return { body: new Uint8Array(await readFile(path.join(LOCAL_DIR(), key))), contentType: PROOF_CONTENT_TYPES[key.split('.').pop() as ProofType] || 'image/jpeg' } } catch { return null }
}

export async function deletePaymentProof(key: string) {
  if (!isProofKey(key)) return
  const bucket = await getMediaBucket()
  if (bucket) await bucket.delete(key).catch(() => {})
  else await unlink(path.join(LOCAL_DIR(), key)).catch(() => {})
}
