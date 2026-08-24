import { NextResponse } from 'next/server'
import { getThemeState } from '@/lib/theme'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { theme, sections, navigation } = await getThemeState()
  return NextResponse.json(
    { theme, sections, navigation },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  )
}
