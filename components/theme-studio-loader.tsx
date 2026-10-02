'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

// The theme studio is a large, purely interactive admin tool: nothing in it needs to exist as
// server-rendered HTML, but its module graph (inspector, presets, page SEO panel, every icon)
// was being evaluated inside the Cloudflare Worker for each request to the editor route.
// Loading it browser-only keeps the Worker's job to authenticating the admin and handing over
// the saved theme data; the editor itself loads in the browser.
const ThemeStudio = dynamic(() => import('@/components/theme-studio'), {
  ssr: false,
  loading: () => <div style={{ padding: 32, font: '600 13px system-ui, sans-serif', color: '#6b6b6b' }}>Loading theme editor…</div>,
})

export default function ThemeStudioLoader(props: ComponentProps<typeof ThemeStudio>) {
  return <ThemeStudio {...props} />
}
