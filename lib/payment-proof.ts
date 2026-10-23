// Payment proof: a customer who pays by bank transfer (a bank account, Whish or OMT: the owner's
// "Bank transfer" method, Settings > Payments) uploads a
// screenshot of the transfer from the order page; staff see it on the order and tap "Mark as paid".
// The rules that need no database, shared by the upload route, the pages and the tests.

export const MAX_PROOF_BYTES = 5 * 1024 * 1024
export const MAX_PROOFS_PER_ORDER = 3
// The store wallet (WALLET) is the customer's own balance, paid at once, so it never needs a screenshot.
export const PROOF_METHODS = ['BANK_TRANSFER']

export const PROOF_MESSAGES = {
  method: 'This order is not paid by transfer, so there is nothing to upload.',
  paid: 'This order is already marked as paid. Thank you!',
  closed: 'This order is closed, so a payment screenshot cannot be added.',
  limit: 'You have already sent the most screenshots allowed for this order. We will check them soon.',
  file: 'Please choose a photo or screenshot (JPG, PNG or WebP) up to 5 MB.',
  tooBig: 'That picture is larger than 5 MB. Please choose a smaller one.',
  notFound: 'Order not found',
  slow: 'Too many attempts. Please try again later.',
  failed: 'We could not save your screenshot right now. Please send it to us on WhatsApp.',
} as const

export type ProofState = { allowed: true } | { allowed: false; reason: 'method' | 'paid' | 'closed' | 'limit' }

// Can this order take another screenshot right now?
export function proofState(order: { paymentMethod: string; paymentStatus: string; status: string }, existing: number): ProofState {
  if (!PROOF_METHODS.includes(order.paymentMethod)) return { allowed: false, reason: 'method' }
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED' || order.paymentStatus === 'REFUNDED') return { allowed: false, reason: 'paid' }
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) return { allowed: false, reason: 'closed' }
  if (existing >= MAX_PROOFS_PER_ORDER) return { allowed: false, reason: 'limit' }
  return { allowed: true }
}

export type ProofType = 'jpg' | 'png' | 'webp'
export const PROOF_CONTENT_TYPES: Record<ProofType, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

// What the file really is, from its first bytes. The name and the type the browser reports are
// never trusted, so a script or a page renamed to .png is refused.
export function sniffProofType(bytes: Uint8Array): ProofType | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

// Storage keys: "proof-" and 32 random hex characters. Only keys of this exact shape are ever read
// or served, and the public media route refuses the "proof-" prefix altogether.
export const PROOF_KEY_PREFIX = 'proof-'
export const isProofKey = (key: unknown): key is string => typeof key === 'string' && /^proof-[a-f0-9]{32}\.(jpg|png|webp)$/.test(key)
