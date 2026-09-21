import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'

function hash(value: string) { return createHash('sha256').update(value).digest('hex') }

export class ApiAuthError extends Error {}

// Authenticates a `Authorization: Bearer <key>` request against ApiCredential, using the same
// hashing scheme the admin route mints keys with (app/api/admin/api-credentials/route.ts).
// Nothing checked a credential against anything before this -- an admin could mint a key with
// any scope and it granted access to nothing anywhere in the app. Bumps lastUsedAt on success
// so the admin panel's "last used" column (previously always empty) reflects real activity.
export async function authenticateApiCredential(req: Request, requiredScope: string) {
  const authHeader = req.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new ApiAuthError('Missing or invalid Authorization header')
  const key = match[1].trim()
  if (!key) throw new ApiAuthError('Missing or invalid Authorization header')

  const credential = await db.apiCredential.findUnique({ where: { keyHash: hash(key) } })
  if (!credential) throw new ApiAuthError('Invalid API key')
  if (credential.status !== 'ACTIVE') throw new ApiAuthError('API key is not active')
  if (credential.expiresAt && new Date(credential.expiresAt) < new Date()) throw new ApiAuthError('API key has expired')

  let scopes: string[] = []
  try { scopes = JSON.parse(credential.scopesJson) } catch { scopes = [] }
  if (!Array.isArray(scopes) || !scopes.includes(requiredScope)) throw new ApiAuthError(`API key is missing the required scope: ${requiredScope}`)

  void db.apiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } }).catch(error => console.error('[api-credentials] lastUsedAt update failed', error))
  return credential
}
