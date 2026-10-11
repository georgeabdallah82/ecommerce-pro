import type { MetadataRoute } from 'next'
import { getThemeState, defaultTheme } from '@/lib/theme'
import { getSiteSeo } from '@/lib/seo'
import { getStorefrontSettings } from '@/lib/storefront-settings'
import { APP_ICON_LARGE, APP_ICON_SMALL, appIconSource, appShortName, manifestIcons } from '@/lib/app-icon'

// Read from the theme and settings on each request, so a new name or icon shows up without a deploy.
export const dynamic = 'force-dynamic'

// What "Add to Home Screen" / "Install app" makes of the store (lib/app-icon.ts): its name, icon and
// colours, opening full screen like an app. On iPhone, a store opened from the home screen can also
// receive notifications.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [{ theme }, settings, seo] = await Promise.all([
    getThemeState().catch(() => ({ theme: defaultTheme })),
    getStorefrontSettings().catch(() => new Map<string, string>()),
    getSiteSeo().catch(() => null),
  ])
  const name = String(seo?.brand || theme.brandName || 'Our store').trim()
  const color = (value: unknown, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : fallback)
  return {
    id: '/',
    name,
    short_name: appShortName(name),
    description: seo?.description || undefined,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: color(theme.colors?.background, '#ffffff'),
    theme_color: color(theme.colors?.surface, '#ffffff'),
    icons: manifestIcons({ large: settings.get(APP_ICON_LARGE), small: settings.get(APP_ICON_SMALL) }, appIconSource(theme)),
  }
}
