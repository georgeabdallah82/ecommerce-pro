import { neon } from '@neondatabase/serverless'

// The lookups proxy.ts makes before every request: redirects, maintenance mode and the staff
// check that lets staff see the store behind the maintenance page. They run as three small SQL
// queries over Neon's HTTP endpoint instead of loading Prisma into the proxy bundle, which keeps
// that bundle small (it is loaded for every request) and free of the node-postgres code
// lib/prisma.ts carries for local databases.
// Without a Neon database (local development, CI) every lookup reports "nothing found": no
// redirects, no maintenance mode, no staff preview.
const databaseUrl = [process.env.NEON_DATABASE_URL, process.env.DATABASE_URL].find(url => !!url && /^postgres(ql)?:\/\//.test(url)) || ''
const sql = (() => {
  try { return new URL(databaseUrl).hostname.endsWith('.neon.tech') ? neon(databaseUrl) : null } catch { return null }
})()

export async function findRedirect(fromPath: string): Promise<{ id: string; toPath: string } | null> {
  if (!sql) return null
  const rows = await sql`SELECT "id", "toPath" FROM "Redirect" WHERE "fromPath" = ${fromPath} LIMIT 1` as { id: string; toPath: string }[]
  return rows[0] ?? null
}

// Same effect as db.redirect.update({ data: { hits: { increment: 1 } } }), including the
// updatedAt stamp Prisma would set.
export async function countRedirectHit(id: string): Promise<void> {
  if (!sql) return
  await sql`UPDATE "Redirect" SET "hits" = "hits" + 1, "updatedAt" = now() WHERE "id" = ${id}`
}

export async function getSettingValue(key: string): Promise<string | null> {
  if (!sql) return null
  const rows = await sql`SELECT "value" FROM "Setting" WHERE "key" = ${key} LIMIT 1` as { value: string }[]
  return rows[0]?.value ?? null
}

// Everything proxy.ts needs, read at once for the copy kept in the media bucket (lib/edge-config.ts): the maintenance
// switch and every redirect. Null without a Neon database (local development, CI).
export const EDGE_REDIRECT_LIMIT = 5000
export async function loadEdgeConfigRows(): Promise<{ maintenance: boolean; redirects: Record<string, [string, string]>; partial: boolean } | null> {
  if (!sql) return null
  const [setting, redirects] = await Promise.all([
    sql`SELECT "value" FROM "Setting" WHERE "key" = 'maintenance.enabled' LIMIT 1`,
    sql`SELECT "id", "fromPath", "toPath" FROM "Redirect" ORDER BY "createdAt" ASC LIMIT ${EDGE_REDIRECT_LIMIT}`,
  ]) as [{ value: string }[], { id: string; fromPath: string; toPath: string }[]]
  const map: Record<string, [string, string]> = {}
  for (const row of redirects) map[row.fromPath] = [row.id, row.toPath]
  // Cut short: the copy says so, and an address not in it is looked up in the database (proxy.ts).
  return { maintenance: setting[0]?.value === 'true', redirects: map, partial: redirects.length >= EDGE_REDIRECT_LIMIT }
}

export async function getStaffAccess(userId: string): Promise<{ isActive: boolean; role: string; sessionsRevokedAt: Date | null; totpEnabled: boolean } | null> {
  if (!sql) return null
  const rows = await sql`SELECT "isActive", "role", "sessionsRevokedAt", "totpEnabledAt" FROM "User" WHERE "id" = ${userId} LIMIT 1` as { isActive: boolean; role: string; sessionsRevokedAt: Date | string | null; totpEnabledAt: Date | string | null }[]
  const row = rows[0]
  if (!row) return null
  // Prisma stores DateTime as UTC "timestamp without time zone"; read it as UTC.
  const revoked = row.sessionsRevokedAt == null ? null : row.sessionsRevokedAt instanceof Date ? row.sessionsRevokedAt : new Date(`${row.sessionsRevokedAt}Z`)
  return { isActive: row.isActive, role: row.role, sessionsRevokedAt: revoked, totpEnabled: row.totpEnabledAt != null }
}
