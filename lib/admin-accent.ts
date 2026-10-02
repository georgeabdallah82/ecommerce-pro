// The admin's accent colour (buttons, active tabs, links, toggles, focus rings, charts) follows
// the store's own Primary colour from the theme instead of a fixed green. Every value is
// derived so text on it stays readable (WCAG AA 4.5:1), in light and dark admin mode.

type Rgb = [number, number, number]

export function parseHex(value: unknown): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim())
  if (!match) return null
  const hex = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1]
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

const toHex = (rgb: Rgb) => `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: Rgb, b: Rgb, amountOfA: number): Rgb => a.map((v, i) => v * amountOfA + b[i] * (1 - amountOfA)) as Rgb

function luminance([r, g, b]: Rgb) {
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Move `color` toward `toward` in small steps until it reaches `ratio` against `against`.
function untilContrast(color: Rgb, toward: Rgb, against: Rgb, ratio: number): Rgb {
  let current = color
  for (let step = 0; step < 40 && contrast(current, against) < ratio; step++) current = mix(current, toward, 0.94)
  return current
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]
const INK: Rgb = [17, 17, 17]
const LIGHT_SURFACE: Rgb = [255, 255, 255]
const DARK_SURFACE: Rgb = [24, 28, 25] // --admin-surface in dark mode

export type AdminAccentVars = { light: Record<string, string>; dark: Record<string, string> }

export function adminAccentVars(primary: unknown): AdminAccentVars | null {
  const base = parseHex(primary)
  if (!base) return null
  const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb.map(Math.round).join(',')},${alpha})`

  // Light mode: the accent must stand out from the white page (3:1, like any control) and
  // carry readable text. A light brand colour (yellow, mint...) keeps its colour with dark
  // text on it; a darker one gets white text, darkened just enough for it to read.
  let accent = untilContrast(base, BLACK, WHITE, 3)
  let lightUsesDarkInk = false
  if (contrast(accent, WHITE) < 4.5) {
    // White text whenever the brand colour is mid-to-dark (a red store keeps white-on-red
    // buttons, nudged a shade darker); dark text only for genuinely light colours.
    if (luminance(base) > 0.4 && contrast(accent, INK) >= 4.5) lightUsesDarkInk = true
    else accent = untilContrast(accent, BLACK, WHITE, 4.5)
  }
  const soft = mix(base, WHITE, 0.1)
  const strong = untilContrast(accent, BLACK, soft, 4.5) // text on the soft tint and on white

  // Dark mode: lightened until it reads on the dark surface; text on it is near-black.
  const darkAccent = untilContrast(base, WHITE, DARK_SURFACE, 4.5)
  const darkInk = contrast(darkAccent, INK) >= contrast(darkAccent, WHITE) ? INK : WHITE
  const darkSoft = mix(base, DARK_SURFACE, 0.22)
  const darkStrong = untilContrast(darkAccent, WHITE, darkSoft, 4.5)

  return {
    light: {
      '--admin-accent': toHex(accent),
      '--admin-accent-ink': toHex(lightUsesDarkInk ? INK : WHITE),
      '--admin-accent-soft': toHex(soft),
      '--admin-accent-strong': toHex(strong),
      '--admin-focus': rgba(accent, 0.18),
      '--chart-current': toHex(accent),
    },
    dark: {
      '--admin-accent': toHex(darkAccent),
      '--admin-accent-ink': toHex(darkInk),
      '--admin-accent-soft': toHex(darkSoft),
      '--admin-accent-strong': toHex(darkStrong),
      '--admin-focus': rgba(darkAccent, 0.24),
      '--chart-current': toHex(darkAccent),
    },
  }
}

export function adminAccentCss(primary: unknown): string {
  const vars = adminAccentVars(primary)
  if (!vars) return ''
  const block = (map: Record<string, string>) => Object.entries(map).map(([k, v]) => `${k}:${v}`).join(';')
  // Same selectors as app/admin/admin-overhaul.css; this <style> comes later in the document, so it wins.
  return `body:has(.adminShell){${block(vars.light)}}html[data-admin-theme='dark'] body:has(.adminShell){${block(vars.dark)}}`
}

export { LIGHT_SURFACE as ADMIN_LIGHT_SURFACE, DARK_SURFACE as ADMIN_DARK_SURFACE }
