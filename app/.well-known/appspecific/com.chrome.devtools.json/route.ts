import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(
    {},
    { status: 200, headers: { 'cache-control': 'public, max-age=3600' } },
  )
}
