// A failed GitHub check reaches the owner like a failing store job (lib/order-alerts.ts): a phone notification and
// an email, at most once per check every 6 hours, and the activity log keeps every failure. GitHub's own email for a
// failed run goes only to whoever set the check up, and only if their notifications allow it: the daily database
// hours check failed for six days that way without anyone seeing it.
//
// .github/workflows/check-alerts.yml runs when one of the checks below fails and reports it here
// (app/api/internal/github-check-failed). It proves where the report comes from with a GitHub OIDC token, signed by
// GitHub for that one run and valid for minutes, so no secret is shared or stored. The token must be for that alert
// workflow, on this repository's main branch, for this store's audience.
export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com'
export const GITHUB_ALERT_AUDIENCE = 'store-check-alerts'
export const ALERT_WORKFLOW = 'check-alerts.yml'
// The repository whose checks may alert. GITHUB_ALERT_REPOSITORY overrides it (a fork, a renamed repository).
export const alertRepository = () => process.env.GITHUB_ALERT_REPOSITORY || 'georgeabdallah82/ecommerce-pro'

// The checks that may alert, by workflow file: the name the owner reads, and what a failure means.
export const GITHUB_CHECKS: Record<string, { name: string; body: string }> = {
  'neon-usage.yml': { name: 'The daily database hours check', body: 'The database has used most of its monthly hours, or is on pace to, or the check could not read them. Open Website status for the numbers.' },
  'database-backup.yml': { name: 'The nightly database backup', body: 'Last night’s database backup failed, so there is no fresh copy. It runs again tonight; the run on GitHub says why.' },
  'store-errors.yml': { name: 'The store error check', body: 'Too many store requests failed in the last 6 hours, or the check could not read them. The run on GitHub has the numbers.' },
  'backup-restore-check.yml': { name: 'The monthly backup restore check', body: 'The monthly test restore of a backup failed, so the backups may not be usable. The run on GitHub says why.' },
  'ci.yml': { name: 'The live store update', body: 'The latest change did not pass its checks or could not be put live, so the live store was not updated. The run on GitHub says why.' },
}

type Claims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string; ref?: string; event_name?: string; workflow_ref?: string }
type Key = { kid?: string; kty?: string; n?: string; e?: string }

const bytes = (part: string) => {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0))
}
const parse = (part: string) => JSON.parse(new TextDecoder().decode(bytes(part)))

// GitHub's signing keys, kept for an hour; read again when a token names a key not seen yet (GitHub rotates them).
let keyCache: { at: number; keys: Key[] } | null = null
async function githubKeys(fresh: boolean): Promise<Key[]> {
  if (keyCache && !fresh && Date.now() - keyCache.at < 60 * 60_000) return keyCache.keys
  const res = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`GitHub keys: HTTP ${res.status}`)
  const keys = ((await res.json()) as { keys?: Key[] }).keys || []
  keyCache = { at: Date.now(), keys }
  return keys
}

// True when the token is GitHub's, for a run of the alert workflow on main. `keys` and `now` are for tests.
export async function verifyAlertToken(token: string, opts: { now?: number; keys?: (fresh: boolean) => Promise<Key[]> } = {}) {
  try {
    const [head, body, signature, extra] = token.split('.')
    if (!head || !body || !signature || extra !== undefined) return false
    const header = parse(head) as { alg?: string; kid?: string }
    if (header.alg !== 'RS256' || !header.kid) return false
    const load = opts.keys || githubKeys
    const jwk = (await load(false)).find(k => k.kid === header.kid) || (await load(true)).find(k => k.kid === header.kid)
    if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return false
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(signature), new TextEncoder().encode(`${head}.${body}`)))) return false
    const claims = parse(body) as Claims
    const now = Math.floor((opts.now ?? Date.now()) / 1000)
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== GITHUB_ISSUER || !audiences.includes(GITHUB_ALERT_AUDIENCE)) return false
    if (!(Number(claims.exp) > now) || Number(claims.nbf || 0) > now + 60) return false
    const repository = alertRepository()
    return claims.repository === repository && claims.ref === 'refs/heads/main' && claims.event_name === 'workflow_run'
      && claims.workflow_ref === `${repository}/.github/workflows/${ALERT_WORKFLOW}@refs/heads/main`
  } catch {
    return false
  }
}

export type FailedCheck = { file: string; name: string; body: string; runUrl: string; runKey: string }

// The failed run a report names ({ check: 'neon-usage.yml', run: '123', attempt: '1' }), or null when it names no
// check of this store's.
export function failedCheck(report: unknown): FailedCheck | null {
  const r = (report && typeof report === 'object' ? report : {}) as Record<string, unknown>
  const file = typeof r.check === 'string' ? r.check : ''
  const run = typeof r.run === 'string' || typeof r.run === 'number' ? String(r.run) : ''
  const attempt = r.attempt === undefined || r.attempt === '' ? '1' : String(r.attempt)
  if (!Object.prototype.hasOwnProperty.call(GITHUB_CHECKS, file) || !/^\d{1,20}$/.test(run) || !/^\d{1,4}$/.test(attempt)) return null
  return { file, ...GITHUB_CHECKS[file], runUrl: `https://github.com/${alertRepository()}/actions/runs/${run}`, runKey: `${run}:${attempt}` }
}
