'use client'

import dynamic from 'next/dynamic'

// The preview frame draws nothing until the theme editor posts it state, so there is
// nothing useful to render on the server -- yet its module graph is the heaviest in the app
// (the real product, shop, cart and homepage components plus the nav and footer). Loading it
// browser-only keeps that whole graph out of the Worker's server render of this route, which
// is where the editor preview was throwing "Worker threw exception" (Error 1101) on the
// live site.
const ThemePreviewFrame = dynamic(() => import('@/components/theme-preview-frame'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh' }} />,
})

export default function ThemePreviewLoader() {
  return <ThemePreviewFrame />
}
