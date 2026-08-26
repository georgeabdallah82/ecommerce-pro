import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.headers.get('Render-Health-Check') === '1') {
    return new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }
}

export const config = {
  matcher: '/:path*',
}
