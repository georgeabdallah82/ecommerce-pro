import { Footer } from '@/components/footer'
import { getThemeState } from '@/lib/theme'

// The footer with the store's own logo, name and footer settings, for server pages that don't
// otherwise load the theme. (A bare <Footer /> falls back to the build-time brand name.)
export async function StoreFooter() {
  const theme = await getThemeState().then(state => state.theme).catch(() => undefined)
  return <Footer theme={theme} />
}
