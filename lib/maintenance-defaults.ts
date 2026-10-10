// Texts of the maintenance page that the owner hasn't changed. No database import, so the
// Settings page (a client component) can show the same defaults the page uses.
export const MAINTENANCE_DEFAULTS = {
  headline: "We'll be right back",
  message: "We're making a few improvements to give you a better shopping experience. Please check back soon.",
} as const

// What the old "coming soon" page saved as its defaults (the Settings page saved every field,
// changed or not). Read as "not set", so the maintenance page doesn't greet customers with them.
const OLD_COMING_SOON_TEXTS = new Set([
  "We're launching soon",
  "We're putting the finishing touches on something great. Check back soon.",
])

export function maintenanceText(saved: string | null | undefined, fallback: string): string {
  const value = String(saved || '').trim()
  return value && !OLD_COMING_SOON_TEXTS.has(value) ? value : fallback
}
