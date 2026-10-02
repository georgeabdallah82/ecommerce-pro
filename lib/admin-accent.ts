// The admin follows the store's own brand colours from the theme: the accent (buttons, active
// tabs, links, toggles, focus rings, charts) comes from Primary, and in light mode the page,
// cards, borders, text and status colours come from the theme's palette too. Every value is
// guarded so text stays readable (WCAG AA 4.5:1); a colour that can't work in the admin (a dark
// page colour in light mode, say) is skipped and the admin keeps its default for it.

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
const DEFAULT_LIGHT_BG: Rgb = [246, 245, 240] // --admin-bg in light mode

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

export type BrandColors = Partial<Record<'background' | 'surface' | 'text' | 'muted' | 'primary' | 'border' | 'success' | 'warning', unknown>>

// A status colour (success, warning) used as text on white and on its own tint, plus a dark-mode twin.
function statusVars(name: 'success' | 'warning', value: unknown, surface: Rgb) {
  const base = parseHex(value)
  if (!base) return null
  const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb.map(Math.round).join(',')},${alpha})`
  const color = untilContrast(base, BLACK, surface, 4.5)
  const soft = mix(base, surface, 0.1)
  const strong = untilContrast(color, BLACK, soft, 6)
  const dark = untilContrast(base, WHITE, DARK_SURFACE, 4.5)
  const darkSoft = mix(base, DARK_SURFACE, 0.22)
  const light: Record<string, string> = { [`--admin-${name}`]: toHex(untilContrast(color, BLACK, soft, 4.5)), [`--admin-${name}-soft`]: toHex(soft) }
  const darkVars: Record<string, string> = { [`--admin-${name}`]: toHex(untilContrast(dark, WHITE, darkSoft, 4.5)), [`--admin-${name}-soft`]: toHex(darkSoft) }
  if (name === 'success') {
    light['--admin-success-strong'] = toHex(strong)
    light['--admin-success-ring'] = rgba(color, 0.16)
    darkVars['--admin-success-strong'] = toHex(untilContrast(dark, WHITE, darkSoft, 6))
    darkVars['--admin-success-ring'] = rgba(dark, 0.22)
  }
  return { light, dark: darkVars }
}

export function adminBrandVars(colors: BrandColors | null | undefined): AdminAccentVars | null {
  if (!colors || typeof colors !== 'object') return null
  const accent = adminAccentVars(colors.primary)
  const light: Record<string, string> = { ...accent?.light }
  const dark: Record<string, string> = { ...accent?.dark }
  const isLight = (rgb: Rgb | null): rgb is Rgb => !!rgb && luminance(rgb) >= 0.8

  // Page and card colours only when they're light; the light admin never turns dark.
  const bgColor = parseHex(colors.background)
  const surfaceColor = parseHex(colors.surface)
  const bg = isLight(bgColor) ? bgColor : null
  const surface = isLight(surfaceColor) ? surfaceColor : LIGHT_SURFACE
  if (bg) {
    light['--admin-bg'] = toHex(bg)
    light['--admin-topbar-bg'] = `rgba(${bg.join(',')},.88)`
  }
  if (isLight(surfaceColor)) light['--admin-surface'] = toHex(surfaceColor)
  const pageBg = bg || DEFAULT_LIGHT_BG
  const page = luminance(pageBg) < luminance(surface) ? pageBg : surface // the darker of page and card

  const border = parseHex(colors.border)
  if (border && luminance(border) >= 0.55 && contrast(border, surface) < 2) {
    light['--admin-border'] = toHex(border)
    light['--admin-border-soft'] = toHex(mix(border, surface, 0.55))
  }

  // Text: the brand ink, darkened if needed so it reads comfortably (7:1) on the page and cards.
  const text = parseHex(colors.text)
  if (text && luminance(text) < 0.2) {
    const ink = untilContrast(text, BLACK, page, 7)
    light['--admin-ink'] = toHex(ink)
    light['--admin-ink-soft'] = toHex(untilContrast(mix(ink, surface, 0.78), BLACK, page, 7))
    light['--admin-shadow-sm'] = `0 1px 2px rgba(${ink.map(Math.round).join(',')},.045)`
    light['--admin-shadow-md'] = `0 8px 24px rgba(${ink.map(Math.round).join(',')},.07)`
    light['--admin-shadow-lg'] = `0 26px 80px rgba(${ink.map(Math.round).join(',')},.18)`
  }
  const muted = parseHex(colors.muted)
  if (muted && luminance(muted) < 0.45) {
    const mutedInk = untilContrast(muted, BLACK, page, 4.5)
    light['--admin-muted'] = toHex(mutedInk)
    light['--admin-muted-soft'] = toHex(mix(mutedInk, surface, 0.62))
  }

  for (const name of ['success', 'warning'] as const) {
    const vars = statusVars(name, colors[name], surface)
    if (vars) { Object.assign(light, vars.light); Object.assign(dark, vars.dark) }
  }
  return Object.keys(light).length || Object.keys(dark).length ? { light, dark } : null
}

const cssFor = (vars: AdminAccentVars | null) => {
  if (!vars) return ''
  const block = (map: Record<string, string>) => Object.entries(map).map(([k, v]) => `${k}:${v}`).join(';')
  // Same selectors as app/admin/admin-overhaul.css; this <style> comes later in the document, so it wins.
  return `body:has(.adminShell){${block(vars.light)}}html[data-admin-theme='dark'] body:has(.adminShell){${block(vars.dark)}}`
}

export const adminAccentCss = (primary: unknown) => cssFor(adminAccentVars(primary))
export const adminBrandCss = (colors: BrandColors | null | undefined) => cssFor(adminBrandVars(colors))

export { LIGHT_SURFACE as ADMIN_LIGHT_SURFACE, DARK_SURFACE as ADMIN_DARK_SURFACE }
