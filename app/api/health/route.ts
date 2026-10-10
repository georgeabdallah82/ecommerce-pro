import { db } from '@/lib/prisma'
import { databaseHealthy } from '@/lib/health'

// Health of the store and its database: one tiny query (db.$connect() is a no-op with the Neon
// adapter, so it used to report "reachable" even with the database down). Each call wakes the
// Neon database if it was asleep, so monitors should call this rarely (about hourly) and use
// /robots.txt, which needs no database, for frequent "is the site up" checks.
export async function GET() {
  try {
    if (!(await databaseHealthy(() => db.setting.findFirst({ select: { key: true } })))) throw new Error('database unreachable')

    return Response.json(
      {
        ok: true,
        status: 'healthy',
        database: 'reachable',
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    )
  } catch {
    return Response.json(
      {
        ok: false,
        status: 'unhealthy',
        database: 'unreachable',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    )
  }
}
