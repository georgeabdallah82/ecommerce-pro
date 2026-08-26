import { db } from '@/lib/prisma'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`

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
