export const dynamic = 'force-static'

export function GET() {
  return Response.json(
    { ok: true, service: 'ecommerce-pro' },
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}
