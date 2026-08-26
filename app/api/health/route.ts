import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(
    { ok: true, service: 'ecommerce-pro' },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}
