import { getThemeState } from '@/lib/theme'
import { adminBrandVars } from '@/lib/admin-accent'
import type { AdminLoginBrand } from './admin-login-form'

// The login page wears the store's own logo and brand colours, like the admin behind it.
export async function getLoginBrand(): Promise<AdminLoginBrand | undefined> {
  const theme = await getThemeState().then(state => state.theme).catch(() => null)
  if (!theme) return undefined
  const light = adminBrandVars(theme.colors)?.light || {}
  const vars: Record<string, string> = {}
  if (light['--admin-accent']) vars['--login-accent'] = light['--admin-accent']
  if (light['--admin-accent-ink']) vars['--login-accent-ink'] = light['--admin-accent-ink']
  if (light['--admin-sidebar-bg']) vars['--login-panel'] = light['--admin-sidebar-bg']
  if (light['--admin-bg']) vars['--login-bg'] = light['--admin-bg']
  return { name: theme.brandName || 'Control Center', logoUrl: theme.logoUrl || undefined, logoDarkUrl: theme.logoUrlDark || undefined, vars }
}
