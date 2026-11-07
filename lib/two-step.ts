import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

// Admin 2-step login: after the password, a 6-digit code from an authenticator app on the
// phone (Google Authenticator, Microsoft Authenticator...). These are the standard "TOTP" codes
// (RFC 6238): a new one every 30 seconds, made from a secret the app and the store share. A
// lost phone is covered by backup codes, shown once when 2-step login is turned on, each good
// once.
//
// The secret is kept encrypted (AES-GCM, key derived from AUTH_SECRET), so a copy of the
// database alone can't make codes. Changing AUTH_SECRET makes the saved secrets unreadable:
// everyone with 2-step login would need it turned off and on again.

const subtle = globalThis.crypto.subtle
const STEP_SECONDS = 30
const DIGITS = 6
export const BACKUP_CODE_COUNT = 10
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  if (!clean || /[^A-Z2-7]/.test(clean)) return null
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return new Uint8Array(out)
}

export const newSecret = () => base32Encode(globalThis.crypto.getRandomValues(new Uint8Array(20)))
export const timeStep = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS)

// The code for one 30-second step (RFC 4226 HOTP with the step as the counter).
export async function totpAt(secret: string, step: number, digits = DIGITS) {
  const key = base32Decode(secret)
  if (!key) throw new Error('Invalid 2-step secret')
  const counter = new Uint8Array(8)
  for (let i = 7, n = step; i >= 0; i--, n = Math.floor(n / 256)) counter[i] = n & 255
  const hmacKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = new Uint8Array(await subtle.sign('HMAC', hmacKey, counter))
  const offset = mac[mac.length - 1] & 15
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// The step a typed code belongs to: this one, or one either side for a phone clock a little
// off. A step at or before `lastStep` was already used to sign in, so its code is refused.
export async function matchTotp(secret: string, code: string, nowMs: number, lastStep: number | null) {
  const typed = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(typed)) return null
  const now = timeStep(nowMs)
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep != null && step <= lastStep) continue
    if (sameText(await totpAt(secret, step), typed)) return step
  }
  return null
}

// A code the app showed for a step that was already used (typed again by mistake): refused, but
// worth a clearer message than "not right".
export async function alreadyUsedTotp(secret: string, code: string, nowMs: number, lastStep: number | null) {
  const typed = code.replace(/\s/g, '')
  if (lastStep == null || !/^\d{6}$/.test(typed)) return false
  const now = timeStep(nowMs)
  for (const step of [now, now - 1, now + 1]) if (step <= lastStep && sameText(await totpAt(secret, step), typed)) return true
  return false
}

// The link authenticator apps open ("otpauth://"), also what the QR code holds.
export function otpauthUri(issuer: string, account: string, secret: string) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

// ---- The secret, encrypted for the database ----

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0))
}

async function sealingKey() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`two-step-login:${raw}`))
  return subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function sealSecret(secret: string) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(), new TextEncoder().encode(secret)))
  return `v1.${toBase64Url(iv)}.${toBase64Url(sealed)}`
}

export async function openSecret(stored: string | null | undefined) {
  const [version, iv, sealed] = String(stored || '').split('.')
  if (version !== 'v1' || !iv || !sealed) return null
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await sealingKey(), fromBase64Url(sealed))
    return new TextDecoder().decode(plain)
  } catch { return null }
}

// ---- Backup codes: "k7m2-p9qx", kept as SHA-256 hashes ----

const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function newBackupCodes(count = BACKUP_CODE_COUNT) {
  return Array.from({ length: count }, () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8))
    const chars = Array.from(bytes, b => BACKUP_ALPHABET[b % BACKUP_ALPHABET.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
  })
}

export const normalizeBackupCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function hashBackupCode(code: string) {
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`backup:${normalizeBackupCode(code)}`)))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}

// The saved hash a typed backup code matches, or '' (codes are 8 letters and digits).
export async function matchBackupCode(code: string, hashes: string[]) {
  if (normalizeBackupCode(code).length !== 8) return ''
  const hash = await hashBackupCode(code)
  return hashes.find(h => sameText(h, hash)) || ''
}

// ---- Between the password and the code: a short-lived signed cookie, only sent to the
// sign-in routes, that says whose password was right ----

export const TWO_STEP_COOKIE = 'admin_2step'
const TICKET_MINUTES = 10
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/api/admin/login' }

function ticketSecret() {
  const raw = process.env.AUTH_SECRET
  if (!raw) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(raw)
}

export async function setTwoStepTicket(userId: string) {
  const token = await new SignJWT({ sub: userId, type: 'two-step' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${TICKET_MINUTES}m`).sign(ticketSecret())
  ;(await cookies()).set(TWO_STEP_COOKIE, token, { ...cookieOptions, maxAge: TICKET_MINUTES * 60 })
}

export async function readTwoStepTicket() {
  const token = (await cookies()).get(TWO_STEP_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, ticketSecret())
    return payload.type === 'two-step' && typeof payload.sub === 'string' ? payload.sub : null
  } catch { return null }
}

export async function clearTwoStepTicket() {
  ;(await cookies()).set(TWO_STEP_COOKIE, '', { ...cookieOptions, maxAge: 0 })
}

// Staff who have no 2-step login yet get a short-lived set-up ticket instead of a session. It only
// lets them open the set-up (app/api/admin/login/enroll); the session starts once their first code checks out.
export const ENROLL_COOKIE = 'admin_enroll'
const enrollCookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/api/admin/login' }

export async function setEnrollTicket(userId: string) {
  const token = await new SignJWT({ sub: userId, type: 'enroll' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${TICKET_MINUTES}m`).sign(ticketSecret())
  ;(await cookies()).set(ENROLL_COOKIE, token, { ...enrollCookieOptions, maxAge: TICKET_MINUTES * 60 })
}

export async function readEnrollTicket() {
  const token = (await cookies()).get(ENROLL_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, ticketSecret())
    return payload.type === 'enroll' && typeof payload.sub === 'string' ? payload.sub : null
  } catch { return null }
}

export async function clearEnrollTicket() {
  ;(await cookies()).set(ENROLL_COOKIE, '', { ...enrollCookieOptions, maxAge: 0 })
}
