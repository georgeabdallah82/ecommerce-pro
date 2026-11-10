// Maintenance page modes and their default texts. No database import, so the Settings page (a
// client component) can show the same defaults the page uses.
export const MAINTENANCE_MODES = ['maintenance', 'under_construction', 'coming_soon', 'updating'] as const
export type MaintenanceMode = (typeof MAINTENANCE_MODES)[number]

export const MAINTENANCE_MODE_INFO: Record<MaintenanceMode, { label: string; badge: string; headline: string; message: string }> = {
  maintenance: {
    label: 'Maintenance',
    badge: 'Scheduled maintenance',
    headline: "We'll be right back",
    message: "We're making a few improvements to give you a better shopping experience. Please check back soon.",
  },
  under_construction: {
    label: 'Under construction',
    badge: 'Under construction',
    headline: "We're building something new",
    message: "Our store is being built right now. Thank you for your patience, we'll open soon.",
  },
  coming_soon: {
    label: 'Coming soon',
    badge: 'Coming soon',
    headline: 'Something new is coming soon',
    message: "We're putting the finishing touches on the store. Check back soon, we can't wait to welcome you.",
  },
  updating: {
    label: 'Updating your experience',
    badge: 'Updating',
    headline: "We're updating your experience",
    message: 'We are improving the store to make shopping faster and easier for you. Thank you for your patience.',
  },
}

// The maintenance mode's texts, kept under the old name the rest of the code imports.
export const MAINTENANCE_DEFAULTS = MAINTENANCE_MODE_INFO.maintenance

export function maintenanceMode(value: string | null | undefined): MaintenanceMode {
  const mode = String(value || '').trim() as MaintenanceMode
  return (MAINTENANCE_MODES as readonly string[]).includes(mode) ? mode : 'maintenance'
}

// Texts saved by earlier versions of the Settings page (it saved every field, changed or not), so
// they count as "not set" and the selected mode's own wording is used instead.
const OLD_DEFAULT_TEXTS = new Set<string>([
  "We're launching soon",
  "We're putting the finishing touches on something great. Check back soon.",
  ...MAINTENANCE_MODES.flatMap(mode => [MAINTENANCE_MODE_INFO[mode].headline, MAINTENANCE_MODE_INFO[mode].message]),
])

export function maintenanceText(saved: string | null | undefined, fallback: string): string {
  const value = String(saved || '').trim()
  return value && !OLD_DEFAULT_TEXTS.has(value) ? value : fallback
}
